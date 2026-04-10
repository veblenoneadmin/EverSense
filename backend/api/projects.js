// Project management API endpoints
import express from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, withOrgScope, requireResourceOwnership } from '../lib/rbac.js';
import { validateBody, validateQuery, commonSchemas, projectSchemas } from '../lib/validation.js';
import { checkDatabaseConnection, handleDatabaseError } from '../lib/api-error-handler.js';
import { createNotification } from './notifications.js';
const router = express.Router();

// Get all projects for a user/organization
router.get('/', requireAuth, withOrgScope, validateQuery(commonSchemas.pagination), async (req, res) => {
  try {
    const { userId, status, limit = 50 } = req.query;
    // Always use req.orgId — set by withOrgScope (falls back to EMERGENCY hardcoded value)
    const orgId = req.orgId;

    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }

    const where = { orgId };
    if (status) where.status = status;

    // CLIENT role — restrict to projects linked to their client record
    const membership = await prisma.membership.findFirst({
      where: { userId: req.user.id, orgId },
      select: { role: true },
    });
    console.log(`[Projects] GET / userId=${req.user.id} orgId=${orgId} role=${membership?.role || 'none'}`);
    if (membership?.role === 'CLIENT') {
      let clientId = null;

      // Get user email for lookups
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { email: true, name: true },
      });
      console.log(`[Projects] CLIENT lookup — userId=${req.user.id} email=${user?.email} orgId=${req.orgId}`);

      // 1) Try user_id lookup (column may not exist on older deployments)
      try {
        const rows = await prisma.$queryRawUnsafe(
          'SELECT id FROM clients WHERE user_id = ? AND orgId = ? LIMIT 1',
          req.user.id, req.orgId
        );
        if (rows.length) { clientId = rows[0].id; console.log(`[Projects] found by user_id: ${clientId}`); }
      } catch { /* user_id column not yet added */ }

      // 2) Fallback: case-insensitive email match
      if (!clientId && user?.email) {
        try {
          const rows = await prisma.$queryRawUnsafe(
            'SELECT id, email FROM clients WHERE LOWER(email) = LOWER(?) AND orgId = ? LIMIT 1',
            user.email, req.orgId
          );
          if (rows.length) { clientId = rows[0].id; console.log(`[Projects] found by email: ${clientId} (db email: ${rows[0].email})`); }
          else {
            // Log ALL clients in this org so we can see what's there
            const allClients = await prisma.$queryRawUnsafe(
              'SELECT id, name, email FROM clients WHERE orgId = ?', req.orgId
            );
            console.log(`[Projects] No email match. Clients in org: ${JSON.stringify(allClients.map(c => ({ id: c.id, email: c.email })))}`);
          }
        } catch (e) { console.warn(`[Projects] email lookup error: ${e.message}`); }
      }

      if (clientId) {
        where.clientId = clientId;
        // Also check how many projects are linked
        const linkedCount = await prisma.project.count({ where: { clientId, orgId } });
        console.log(`[Projects] clientId=${clientId} → ${linkedCount} linked projects in org`);
      } else {
        console.log(`[Projects] CLIENT ${req.user.id} → no client record found`);
        return res.json({ success: true, projects: [], total: 0 });
      }
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: [
        { updatedAt: 'desc' },
        { createdAt: 'desc' }
      ],
      take: parseInt(limit)
    });
    
    if (where.clientId) {
      console.log(`[Projects] CLIENT query returned ${projects.length} projects for clientId=${where.clientId}`);
    }

    // Enrich projects with task stats and actual time spent
    const enrichedProjects = [...projects];
    if (projects.length) {
      try {
        const projectIds = projects.map(p => p.id);
        const ph = projectIds.map(() => '?').join(',');
        const taskStats = await prisma.$queryRawUnsafe(
          `SELECT projectId,
                  COUNT(*) AS total,
                  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
                  SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS inProgress,
                  SUM(COALESCE(actualHours, 0)) AS timeSpent
           FROM macro_tasks
           WHERE projectId IN (${ph})
           GROUP BY projectId`,
          ...projectIds
        );
        const statsMap = {};
        for (const row of taskStats) {
          statsMap[row.projectId] = {
            total:      Number(row.total),
            completed:  Number(row.completed),
            inProgress: Number(row.inProgress),
            pending:    Number(row.total) - Number(row.completed) - Number(row.inProgress),
            timeSpent:  Number(row.timeSpent),
          };
        }
        for (const p of enrichedProjects) {
          p.tasks = statsMap[p.id] || { total: 0, completed: 0, inProgress: 0, pending: 0, timeSpent: 0 };
          p.hoursLogged = statsMap[p.id]?.timeSpent ?? p.hoursLogged;
        }
      } catch (statsErr) {
        console.warn('[Projects] task stats enrichment failed:', statsErr.message);
      }
    }

    res.json({
      success: true,
      projects: enrichedProjects,
      total: enrichedProjects.length
    });
    
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch projects');
  }
});

// Create new project
router.post('/', requireAuth, withOrgScope, validateBody(projectSchemas.create), async (req, res) => {
  try {
    let { orgId, name, description, clientId, budget, estimatedHours, startDate, endDate, priority, status, color } = req.body;
    
    // EMERGENCY FIX: Auto-provide orgId if missing but user is authenticated
    if (!orgId && req.user?.id) {
      console.log('🔧 EMERGENCY: Auto-adding orgId for project creation');
      orgId = 'org_1757046595553';
    }
    
    if (!orgId || !name) {
      return res.status(400).json({ error: 'Missing required fields: orgId and name are required' });
    }
    
    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }
    
    const project = await prisma.project.create({
      data: {
        orgId,
        name,
        description: description || null,
        clientId: clientId || null,
        budget: budget ? parseFloat(budget) : null,
        estimatedHours: estimatedHours ? parseInt(estimatedHours) : 0,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        priority: priority || 'medium',
        status: status || 'planning',
        color: color || 'bg-primary'
      },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    console.log(`✅ Created new project: ${name}`);

    // Notify all org admins/owners about the new project (excluding the creator)
    try {
      const creator = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
      const admins = await prisma.membership.findMany({
        where: { orgId: project.orgId, role: { in: ['OWNER', 'ADMIN', 'HALL_OF_JUSTICE'] } },
        select: { userId: true },
      });
      for (const { userId: adminId } of admins) {
        if (adminId !== req.user.id) {
          createNotification({
            userId: adminId,
            orgId: project.orgId,
            title: `New Project: ${project.name}`,
            body: `Created by ${creator?.name || 'a team member'}.`,
            type: 'project',
            link: '/projects',
          });
        }
      }
    } catch (_) {}

    res.status(201).json({
      success: true,
      project
    });
    
  } catch (error) {
    return handleDatabaseError(error, res, 'create project');
  }
});

// Update project
router.patch('/:id', requireAuth, withOrgScope, validateBody(projectSchemas.update), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }
    
    // Remove fields that shouldn't be updated directly
    delete updates.id;
    delete updates.createdAt;
    delete updates.updatedAt;
    delete updates.orgId;
    
    // Handle numeric fields
    if (updates.budget !== undefined) {
      updates.budget = updates.budget ? parseFloat(updates.budget) : null;
    }
    if (updates.estimatedHours !== undefined) {
      updates.estimatedHours = updates.estimatedHours ? parseInt(updates.estimatedHours) : 0;
    }
    if (updates.hoursLogged !== undefined) {
      updates.hoursLogged = updates.hoursLogged ? parseInt(updates.hoursLogged) : 0;
    }
    if (updates.progress !== undefined) {
      updates.progress = updates.progress ? parseInt(updates.progress) : 0;
    }
    if (updates.spent !== undefined) {
      updates.spent = updates.spent ? parseFloat(updates.spent) : 0;
    }
    
    // Handle date fields
    if (updates.startDate) {
      updates.startDate = new Date(updates.startDate);
    }
    if (updates.endDate) {
      updates.endDate = new Date(updates.endDate);
    }
    
    const project = await prisma.project.update({
      where: { id },
      data: updates,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    console.log(`📝 Updated project ${id}`);

    // Notify org admins/owners if status was changed (excluding the updater)
    if (updates.status) {
      try {
        const updater = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
        const admins = await prisma.membership.findMany({
          where: { orgId: project.orgId, role: { in: ['OWNER', 'ADMIN', 'HALL_OF_JUSTICE'] } },
          select: { userId: true },
        });
        for (const { userId: adminId } of admins) {
          if (adminId !== req.user.id) {
            createNotification({
              userId: adminId,
              orgId: project.orgId,
              title: `Project Updated: ${project.name}`,
              body: `Status changed to "${project.status}" by ${updater?.name || 'a team member'}.`,
              type: 'project',
              link: '/projects',
            });
          }
        }
      } catch (_) {}
    }

    res.json({
      success: true,
      project,
      message: 'Project updated successfully'
    });
    
  } catch (error) {
    return handleDatabaseError(error, res, 'update project');
  }
});

// Delete project
router.delete('/:id', requireAuth, withOrgScope, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }
    
    await prisma.project.delete({
      where: { id }
    });
    
    console.log(`🗑️ Deleted project ${id}`);
    
    res.json({ 
      success: true, 
      message: 'Project deleted successfully' 
    });
    
  } catch (error) {
    return handleDatabaseError(error, res, 'delete project');
  }
});

// Get project statistics
router.get('/stats', requireAuth, withOrgScope, validateQuery(commonSchemas.pagination), async (req, res) => {
  try {
    const { userId, orgId } = req.query;
    
    if (!orgId) {
      return res.status(400).json({ error: 'orgId is required' });
    }
    
    // Check database connection first
    if (!(await checkDatabaseConnection(res))) {
      return; // Response already sent by checkDatabaseConnection
    }
    
    const projects = await prisma.project.findMany({
      where: { orgId },
      select: {
        status: true,
        budget: true,
        spent: true,
        hoursLogged: true,
        estimatedHours: true,
        endDate: true
      }
    });
    
    const now = new Date();
    const stats = {
      total: projects.length,
      active: projects.filter(p => p.status === 'active').length,
      completed: projects.filter(p => p.status === 'completed').length,
      overdue: projects.filter(p => p.endDate && new Date(p.endDate) < now && p.status !== 'completed').length,
      totalBudget: projects.reduce((sum, p) => sum + (p.budget || 0), 0),
      totalSpent: projects.reduce((sum, p) => sum + (p.spent || 0), 0),
      totalHours: projects.reduce((sum, p) => sum + (p.hoursLogged || 0), 0),
      totalEstimatedHours: projects.reduce((sum, p) => sum + (p.estimatedHours || 0), 0)
    };
    
    res.json({ 
      success: true, 
      stats 
    });
    
  } catch (error) {
    return handleDatabaseError(error, res, 'fetch project statistics');
  }
});

// ── Keyword-based task simulation (fallback when no AI key is set) ────────────
function simulateTaskGeneration(name, description, priority) {
  const text = `${name} ${description || ''}`.toLowerCase();
  const p    = { high: 'High', medium: 'Medium', low: 'Low' }[priority?.toLowerCase()] || 'Medium';

  const isWeb      = /web|website|frontend|react|angular|vue|ui|ux|portal/.test(text);
  const isMobile   = /mobile|app|ios|android|flutter|react native/.test(text);
  const isDesign   = /design|figma|brand|logo|graphic|visual/.test(text);
  const isMarketing = /marketing|campaign|social|seo|content|email/.test(text);
  const isData     = /data|analytics|report|dashboard|bi|machine learning|ml|ai/.test(text);

  let milestones;

  if (isWeb || isMobile) {
    milestones = [
      { name: 'Planning & Design', description: 'Define requirements and create designs', tasks: [
        { title: 'Design UI wireframes',          description: 'Create wireframes and mockups for key user flows', requiredSkills: ['UI Design'],  priority: p, estimatedHours: 8 },
        { title: 'Set up project structure',       description: 'Initialize repository and configure dev environment', requiredSkills: ['DevOps'],   priority: p, estimatedHours: 4 },
      ]},
      { name: 'Development', description: 'Build frontend and backend', tasks: [
        { title: 'Implement frontend components',  description: 'Build reusable UI components based on designs', requiredSkills: ['React'],        priority: p, estimatedHours: 16 },
        { title: 'Develop backend API endpoints',  description: 'Create REST API endpoints for all features', requiredSkills: ['Backend API'], priority: p, estimatedHours: 12 },
        { title: 'Database schema design',         description: 'Design and implement database models', requiredSkills: ['Database'],     priority: p, estimatedHours: 6  },
      ]},
      { name: 'Testing & Launch', description: 'Test and deploy to production', tasks: [
        { title: 'QA testing and bug fixes',       description: 'Conduct end-to-end testing and resolve issues', requiredSkills: ['QA Testing'], priority: p, estimatedHours: 8  },
        { title: 'Deployment and monitoring setup', description: 'Deploy to production and configure monitoring', requiredSkills: ['DevOps'],      priority: 'Low', estimatedHours: 4 },
      ]},
    ];
  } else if (isDesign) {
    milestones = [
      { name: 'Research', description: 'Competitor analysis and direction', tasks: [
        { title: 'Brand research and moodboard', description: 'Research competitors and create design direction', requiredSkills: ['UI Design'], priority: p, estimatedHours: 6 },
      ]},
      { name: 'Design', description: 'Create identity and design system', tasks: [
        { title: 'Logo and identity design',     description: 'Create primary logo and brand identity system', requiredSkills: ['UI Design'], priority: p, estimatedHours: 12 },
        { title: 'Design system creation',       description: 'Build reusable component library and style guide', requiredSkills: ['UI Design'], priority: p, estimatedHours: 10 },
      ]},
      { name: 'Delivery', description: 'Review and final delivery', tasks: [
        { title: 'Client review and revisions',  description: 'Present designs and incorporate feedback', requiredSkills: ['Project Management'], priority: p, estimatedHours: 4 },
        { title: 'Final asset export',           description: 'Export all assets in required formats', requiredSkills: ['UI Design'], priority: 'Low', estimatedHours: 3 },
      ]},
    ];
  } else if (isMarketing) {
    milestones = [
      { name: 'Strategy', description: 'Define campaign strategy', tasks: [
        { title: 'Campaign strategy and planning', description: 'Define target audience, goals, and KPIs', requiredSkills: ['Project Management'], priority: p, estimatedHours: 6 },
        { title: 'SEO and keyword research',       description: 'Research and implement SEO strategy', requiredSkills: ['Backend API'], priority: p, estimatedHours: 8 },
      ]},
      { name: 'Execution', description: 'Create and launch campaign', tasks: [
        { title: 'Content creation',               description: 'Write copy and create visuals', requiredSkills: ['UI Design'], priority: p, estimatedHours: 12 },
        { title: 'Campaign launch and monitoring',  description: 'Launch campaign and monitor metrics', requiredSkills: ['Project Management'], priority: p, estimatedHours: 4 },
      ]},
      { name: 'Analysis', description: 'Measure and report results', tasks: [
        { title: 'Results analysis and reporting',  description: 'Analyse results and prepare report', requiredSkills: ['Project Management'], priority: 'Low', estimatedHours: 4 },
      ]},
    ];
  } else if (isData) {
    milestones = [
      { name: 'Discovery', description: 'Gather requirements and plan', tasks: [
        { title: 'Data requirements gathering', description: 'Define data sources, metrics, and needs', requiredSkills: ['Project Management'], priority: p, estimatedHours: 4 },
      ]},
      { name: 'Build', description: 'Set up data infrastructure', tasks: [
        { title: 'Database and pipeline setup', description: 'Set up data ingestion and transformation', requiredSkills: ['Database'], priority: p, estimatedHours: 10 },
        { title: 'Dashboard design',           description: 'Design and build data visualisations', requiredSkills: ['UI Design'], priority: p, estimatedHours: 12 },
      ]},
      { name: 'Validate & Deliver', description: 'Test and hand over', tasks: [
        { title: 'Data validation and testing', description: 'Validate accuracy and test edge cases', requiredSkills: ['QA Testing'], priority: p, estimatedHours: 6 },
        { title: 'Documentation and handover',  description: 'Document data models and prepare guide', requiredSkills: ['Project Management'], priority: 'Low', estimatedHours: 3 },
      ]},
    ];
  } else {
    milestones = [
      { name: 'Planning', description: 'Define requirements and architecture', tasks: [
        { title: `Define ${name} requirements`, description: 'Document detailed requirements and criteria', requiredSkills: ['Project Management'], priority: p, estimatedHours: 4 },
        { title: 'Solution architecture design', description: 'Design technical approach and interactions', requiredSkills: ['Backend API'], priority: p, estimatedHours: 6 },
      ]},
      { name: 'Implementation', description: 'Build core functionality', tasks: [
        { title: 'Core implementation – Phase 1', description: 'Implement primary features and core functionality', requiredSkills: ['Backend API'], priority: p, estimatedHours: 16 },
      ]},
      { name: 'Testing & Delivery', description: 'Test and deploy', tasks: [
        { title: 'Testing and quality assurance', description: 'Conduct thorough testing across all features', requiredSkills: ['QA Testing'], priority: p, estimatedHours: 8 },
        { title: 'Deployment and handover',       description: 'Deploy to production and prepare documentation', requiredSkills: ['DevOps'], priority: 'Low', estimatedHours: 4 },
      ]},
    ];
  }

  // Flatten tasks with milestone name tag
  const tasks = milestones.flatMap(m => (m.tasks || []).map(t => ({ ...t, _milestoneName: m.name })));
  return { milestones, tasks };
}

// ── POST /api/projects/:id/generate-tasks ────────────────────────────────────
// Generates tasks from project keywords via OpenRouter AI (same key as Brain
// Dump), falls back to keyword-based simulation if no key is configured.
router.post('/:id/generate-tasks', requireAuth, withOrgScope, async (req, res) => {
  try {
    const { id } = req.params;
    const orgId  = req.orgId;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project)              return res.status(404).json({ error: 'Project not found' });
    if (project.orgId !== orgId) return res.status(403).json({ error: 'Access denied' });

    // 1. Generate task list — AI if key available, else simulation ─────────────
    let generatedTasks;
    let generatedMilestones = [];
    const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
    const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY;

    if (OPENROUTER_KEY || ANTHROPIC_KEY) {
      const prompt = `You are a project management assistant. Generate milestones with tasks grouped under them for this project.

Project Name: ${project.name}
Description:  ${project.description || 'No description provided'}
Priority:     ${project.priority}

Return ONLY a JSON object — no markdown, no extra text:
{
  "milestones": [
    {
      "name": "Milestone name",
      "description": "One sentence about this phase",
      "tasks": [
        {
          "title": "Task title",
          "description": "One sentence describing what needs to be done",
          "requiredSkills": ["Skill name"],
          "priority": "high|medium|low",
          "estimatedHours": <number>
        }
      ]
    }
  ]
}
Rules: 3-5 milestones, 2-4 tasks per milestone, 1-2 skills each task (use: React, UI Design, Backend API, QA Testing, Project Management, Database, DevOps), estimatedHours 1-16. Order milestones chronologically (planning → implementation → testing → delivery).`;

      let aiRaw = null;
      try {
        if (OPENROUTER_KEY) {
          // OpenRouter (same provider as Brain Dump)
          const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OPENROUTER_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'openai/gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 1500, temperature: 0.3 }),
          });
          if (r.ok) {
            const d = await r.json();
            aiRaw = d.choices?.[0]?.message?.content || null;
          }
        } else if (ANTHROPIC_KEY) {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
          });
          if (r.ok) {
            const d = await r.json();
            aiRaw = d.content?.[0]?.text || null;
          }
        }
      } catch (aiErr) {
        console.warn('[Projects] AI call failed, falling back to simulation:', aiErr.message);
      }

      if (aiRaw) {
        try {
          const parsed = JSON.parse(aiRaw.replace(/```json|```/g, '').trim());
          // New format: { milestones: [...] }
          if (parsed.milestones && Array.isArray(parsed.milestones)) {
            generatedMilestones = parsed.milestones;
            generatedTasks = parsed.milestones.flatMap(m => (m.tasks || []).map(t => ({ ...t, _milestoneName: m.name })));
          } else if (Array.isArray(parsed)) {
            // Old format: flat task array (backward compat)
            generatedTasks = parsed;
          }
        } catch {
          console.warn('[Projects] AI response parse failed, using simulation');
        }
      }
    }

    // Simulation fallback — also generates milestones
    if (!generatedTasks || !Array.isArray(generatedTasks) || generatedTasks.length === 0) {
      console.log('[Projects] Using keyword-based simulation for task generation');
      const sim = simulateTaskGeneration(project.name, project.description, project.priority);
      generatedMilestones = sim.milestones || [];
      generatedTasks = sim.tasks || sim;
    }

    // 2. Fetch all staff with their skills ────────────────────────────────────
    // Falls back to no-skills query if skills tables don't exist yet (P2021)
    let memberships;
    try {
      memberships = await prisma.membership.findMany({
        where: { orgId, role: { in: ['STAFF', 'ADMIN', 'OWNER', 'HALL_OF_JUSTICE'] } },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
            include: {
              staffSkills: {
                where:   { orgId },
                include: { skill: true },
              },
            },
          },
        },
      });
    } catch (skillsErr) {
      console.warn('[Projects] staffSkills tables not ready, skipping skills-based assignment:', skillsErr.message);
      memberships = await prisma.membership.findMany({
        where: { orgId, role: { in: ['STAFF', 'ADMIN', 'OWNER', 'HALL_OF_JUSTICE'] } },
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      });
      // Patch in empty staffSkills so the rest of the code works unchanged
      memberships = memberships.map(m => ({ ...m, user: { ...m.user, staffSkills: [] } }));
    }

    // Workload: open task count per user
    const workloadMap = {};
    if (memberships.length) {
      const counts = await Promise.all(
        memberships.map(m =>
          prisma.macroTask.count({
            where: { userId: m.userId, orgId, status: { in: ['not_started', 'in_progress'] } },
          }).then(count => ({ userId: m.userId, count }))
        )
      );
      counts.forEach(w => { workloadMap[w.userId] = w.count; });
    }

    const WORKLOAD_LIMIT = 10; // open tasks before considered overloaded

    // 2b. Create milestones if generated ────────────────────────────────────
    const milestoneMap = {}; // name → id
    if (generatedMilestones.length > 0) {
      await ensureMilestonesTable();
      // Clear existing milestones for this project (regenerate = fresh)
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET milestoneId = NULL WHERE projectId = ? AND orgId = ?', id, orgId
      ).catch(() => {});
      await prisma.$executeRawUnsafe(
        'DELETE FROM project_milestones WHERE projectId = ? AND orgId = ?', id, orgId
      ).catch(() => {});

      for (let i = 0; i < generatedMilestones.length; i++) {
        const ms = generatedMilestones[i];
        const msId = randomUUID();
        const msStatus = i === 0 ? 'active' : 'pending'; // First milestone is active, rest are pending
        await prisma.$executeRawUnsafe(
          `INSERT INTO project_milestones (id, projectId, orgId, name, description, status, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          msId, id, orgId, ms.name, ms.description || null, msStatus, i
        ).catch(e => console.error('[Projects] milestone create error:', e.message));
        milestoneMap[ms.name] = msId;
      }
      console.log(`[Projects] Created ${generatedMilestones.length} milestones for "${project.name}"`);
    }

    // 3. Assign + create each task ────────────────────────────────────────────
    const createdTasks = [];
    const priorityFmt  = { high: 'High', medium: 'Medium', low: 'Low' };

    for (const taskDef of generatedTasks) {
      const reqSkills = taskDef.requiredSkills || [];

      // Score every staff member
      const scored = memberships.map(m => {
        const workload       = workloadMap[m.userId] || 0;
        const matchingSkills = m.user.staffSkills.filter(ss =>
          reqSkills.some(rs =>
            ss.skill.name.toLowerCase().includes(rs.toLowerCase()) ||
            rs.toLowerCase().includes(ss.skill.name.toLowerCase())
          )
        );
        const skillScore = matchingSkills.reduce((sum, ss) => sum + ss.level, 0);
        const topSkill   = [...matchingSkills].sort((a, b) => b.level - a.level)[0];

        return {
          userId:        m.userId,
          name:          m.user.name || m.user.email,
          email:         m.user.email,
          image:         m.user.image,
          workload,
          skillScore,
          topSkillName:  topSkill?.skill.name || null,
          topSkillLevel: topSkill?.level       || 0,
          available:     workload < WORKLOAD_LIMIT,
        };
      });

      scored.sort((a, b) =>
        b.skillScore !== a.skillScore ? b.skillScore - a.skillScore : a.workload - b.workload
      );

      const assignee   = scored[0] || null;
      const assignedTo = assignee?.userId || req.user.id;
      const priority   = priorityFmt[taskDef.priority?.toLowerCase()] ||
                         priorityFmt[project.priority?.toLowerCase()]  || 'Medium';

      try {
        const task = await prisma.macroTask.create({
          data: {
            title:          String(taskDef.title),
            description:    taskDef.description ? String(taskDef.description) : null,
            userId:         assignedTo,
            orgId,
            projectId:      id,
            createdBy:      req.user.id,
            priority,
            estimatedHours: parseFloat(taskDef.estimatedHours) || 0,
            status:         'not_started',
            tags:           reqSkills,
          },
        });

        // Link task to milestone if generated with one
        const msId = taskDef._milestoneName ? milestoneMap[taskDef._milestoneName] : null;
        if (msId) {
          await prisma.$executeRawUnsafe(
            'UPDATE macro_tasks SET milestoneId = ? WHERE id = ?', msId, task.id
          ).catch(() => {});
        }

        if (assignee) workloadMap[assignee.userId] = (workloadMap[assignee.userId] || 0) + 1;

        createdTasks.push({
          id:             task.id,
          title:          task.title,
          description:    task.description,
          priority:       task.priority,
          estimatedHours: Number(task.estimatedHours),
          status:         task.status,
          requiredSkills: reqSkills,
          assignee: assignee ? {
            userId:        assignee.userId,
            name:          assignee.name,
            email:         assignee.email,
            image:         assignee.image,
            workload:      assignee.workload,
            skillScore:    assignee.skillScore,
            topSkillName:  assignee.topSkillName,
            topSkillLevel: assignee.topSkillLevel,
          } : null,
        });
      } catch (taskErr) {
        console.error(`[Projects] Failed to create task "${taskDef.title}":`, taskErr.message);
        // Skip this task and continue with the rest
      }
    }

    if (createdTasks.length === 0) {
      return res.status(500).json({ error: 'All task creations failed — check server logs' });
    }

    console.log(`[Projects] ✅ Generated ${createdTasks.length} tasks for "${project.name}"`);
    res.json({ success: true, tasks: createdTasks, count: createdTasks.length });

  } catch (err) {
    console.error('[Projects] generate-tasks error:', err);
    res.status(500).json({ error: 'Failed to generate tasks', details: err.message });
  }
});

// ── GET /api/projects/:id/overview ───────────────────────────────────────────
// Returns project + all its tasks with assignee info.
router.get('/:id/overview', requireAuth, withOrgScope, async (req, res) => {
  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where:   { id },
      include: { client: { select: { id: true, name: true, email: true } } },
    });
    if (!project)                  return res.status(404).json({ error: 'Project not found' });
    if (project.orgId !== req.orgId) return res.status(403).json({ error: 'Access denied' });

    const tasks = await prisma.macroTask.findMany({
      where:   { projectId: id },
      orderBy: { createdAt: 'asc' },
    });

    // Enrich with user data (non-fatal)
    const userIds  = [...new Set(tasks.map(t => t.userId).filter(Boolean))];
    const usersMap = {};
    if (userIds.length) {
      try {
        const users = await prisma.user.findMany({
          where:  { id: { in: userIds } },
          select: { id: true, name: true, email: true, image: true },
        });
        users.forEach(u => { usersMap[u.id] = u; });
      } catch { /* non-fatal */ }
    }

    const enriched = tasks.map(t => {
      const u = t.userId ? usersMap[t.userId] : null;
      return {
        id:             t.id,
        title:          t.title,
        description:    t.description,
        status:         t.status,
        priority:       t.priority,
        estimatedHours: t.estimatedHours,
        actualHours:    t.actualHours,
        requiredSkills: Array.isArray(t.tags) ? t.tags : [],
        createdAt:      t.createdAt,
        dueDate:        t.dueDate,
        assignee: u ? {
          userId: t.userId,
          name:   u.name || u.email,
          email:  u.email,
          image:  u.image,
        } : null,
      };
    });

    res.json({ success: true, project, tasks: enriched });

  } catch (err) {
    console.error('[Projects] overview error:', err);
    res.status(500).json({ error: 'Failed to fetch project overview' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT MILESTONES
// ─────────────────────────────────────────────────────────────────────────────

let milestonesReady = false;
async function ensureMilestonesTable() {
  if (milestonesReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `project_milestones` (' +
      '  `id` VARCHAR(191) NOT NULL,' +
      '  `projectId` VARCHAR(50) NOT NULL,' +
      '  `orgId` VARCHAR(191) NOT NULL,' +
      '  `name` VARCHAR(300) NOT NULL,' +
      '  `description` TEXT NULL,' +
      '  `dueDate` DATETIME(3) NULL,' +
      '  `status` VARCHAR(20) NOT NULL DEFAULT \'pending\',' +
      '  `sortOrder` INT NOT NULL DEFAULT 0,' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  KEY `pm_projectId_idx` (`projectId`),' +
      '  KEY `pm_orgId_idx` (`orgId`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
  } catch (_) {}
  // Add milestoneId column to macro_tasks if not exists
  try {
    await prisma.$executeRawUnsafe(
      "ALTER TABLE macro_tasks ADD COLUMN `milestoneId` VARCHAR(191) NULL"
    );
  } catch (_) {}
  try {
    await prisma.$executeRawUnsafe(
      "CREATE INDEX `mt_milestoneId_idx` ON macro_tasks (`milestoneId`)"
    );
  } catch (_) {}
  milestonesReady = true;
}

/** GET /api/projects/:projectId/milestones — includes tasks per milestone */
router.get('/:projectId/milestones', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureMilestonesTable();
    const milestones = await prisma.$queryRawUnsafe(
      'SELECT * FROM project_milestones WHERE projectId = ? AND orgId = ? ORDER BY sortOrder ASC, dueDate ASC',
      req.params.projectId, req.orgId
    );

    // Fetch tasks for each milestone + unassigned tasks
    let allTasks = [];
    try {
      allTasks = await prisma.$queryRawUnsafe(
        `SELECT t.id, t.title, t.status, t.priority, t.milestoneId,
                u.name AS assigneeName, u.email AS assigneeEmail
         FROM macro_tasks t
         LEFT JOIN User u ON u.id = t.userId
         WHERE t.projectId = ? AND t.orgId = ?
         ORDER BY t.priority DESC, t.createdAt ASC`,
        req.params.projectId, req.orgId
      );
    } catch (taskErr) {
      // milestoneId column might not exist yet — try without it
      console.warn('[Milestones] task query failed, retrying without milestoneId:', taskErr.message);
      try {
        const rows = await prisma.$queryRawUnsafe(
          `SELECT t.id, t.title, t.status, t.priority,
                  u.name AS assigneeName, u.email AS assigneeEmail
           FROM macro_tasks t
           LEFT JOIN User u ON u.id = t.userId
           WHERE t.projectId = ? AND t.orgId = ?
           ORDER BY t.priority DESC, t.createdAt ASC`,
          req.params.projectId, req.orgId
        );
        allTasks = rows.map(r => ({ ...r, milestoneId: null }));
      } catch (e2) {
        console.error('[Milestones] task query fallback also failed:', e2.message);
        allTasks = [];
      }
    }

    // Group tasks by milestoneId
    const taskMap = {};
    const unassigned = [];
    for (const t of allTasks) {
      if (t.milestoneId) {
        if (!taskMap[t.milestoneId]) taskMap[t.milestoneId] = [];
        taskMap[t.milestoneId].push(t);
      } else {
        unassigned.push(t);
      }
    }

    const enriched = milestones.map(m => ({
      ...m,
      tasks: taskMap[m.id] || [],
    }));

    res.json({ success: true, milestones: enriched, unassignedTasks: unassigned });
  } catch (e) {
    console.error('[Milestones] GET error:', e.message);
    res.status(500).json({ error: 'Failed to fetch milestones' });
  }
});

/** POST /api/projects/:projectId/milestones */
router.post('/:projectId/milestones', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureMilestonesTable();
    const { name, description, dueDate, sortOrder } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Milestone name is required' });

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO project_milestones (id, projectId, orgId, name, description, dueDate, sortOrder) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id, req.params.projectId, req.orgId,
      name.trim(),
      description || null,
      dueDate ? new Date(dueDate) : null,
      sortOrder ?? 0
    );

    console.log(`📌 Milestone created: "${name.trim()}" for project ${req.params.projectId}`);
    res.status(201).json({ success: true, milestone: { id, name: name.trim(), status: 'pending' } });
  } catch (e) {
    console.error('[Milestones] POST error:', e.message);
    res.status(500).json({ error: 'Failed to create milestone' });
  }
});

/** PATCH /api/projects/:projectId/milestones/:id */
/** PATCH /api/projects/:projectId/milestones/:milestoneId/tasks — assign/unassign a task */
// NOTE: This route MUST come BEFORE /:projectId/milestones/:id to avoid Express catching /tasks as :id
router.patch('/:projectId/milestones/:milestoneId/tasks', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureMilestonesTable();
    const { taskId, action } = req.body; // action: 'assign' | 'unassign'
    if (!taskId) return res.status(400).json({ error: 'taskId is required' });

    if (action === 'unassign') {
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET milestoneId = NULL, updatedAt = NOW(3) WHERE id = ? AND orgId = ?',
        taskId, req.orgId
      );
    } else {
      await prisma.$executeRawUnsafe(
        'UPDATE macro_tasks SET milestoneId = ?, updatedAt = NOW(3) WHERE id = ? AND orgId = ?',
        req.params.milestoneId, taskId, req.orgId
      );
    }
    console.log(`📌 Task ${taskId} ${action === 'unassign' ? 'unassigned from' : 'assigned to'} milestone ${req.params.milestoneId}`);
    res.json({ success: true });
  } catch (e) {
    console.error('[Milestones] task assign error:', e.message);
    res.status(500).json({ error: `Failed to assign task: ${e.message}` });
  }
});

router.patch('/:projectId/milestones/:id', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureMilestonesTable();
    const { name, description, dueDate, status, sortOrder } = req.body;
    const sets = [];
    const vals = [];
    if (name !== undefined)        { sets.push('name = ?');        vals.push(name.trim()); }
    if (description !== undefined)  { sets.push('description = ?'); vals.push(description || null); }
    if (dueDate !== undefined)      { sets.push('dueDate = ?');     vals.push(dueDate ? new Date(dueDate) : null); }
    if (status !== undefined)       { sets.push('status = ?');      vals.push(status); }
    if (sortOrder !== undefined)    { sets.push('sortOrder = ?');   vals.push(sortOrder); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    await prisma.$executeRawUnsafe(
      `UPDATE project_milestones SET ${sets.join(', ')} WHERE id = ? AND projectId = ? AND orgId = ?`,
      ...vals, req.params.id, req.params.projectId, req.orgId
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Milestones] PATCH error:', e.message);
    res.status(500).json({ error: 'Failed to update milestone' });
  }
});

/** DELETE /api/projects/:projectId/milestones/:id */
router.delete('/:projectId/milestones/:id', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureMilestonesTable();
    // Unassign tasks from this milestone before deleting
    await prisma.$executeRawUnsafe(
      'UPDATE macro_tasks SET milestoneId = NULL WHERE milestoneId = ? AND orgId = ?',
      req.params.id, req.orgId
    ).catch(() => {});
    await prisma.$executeRawUnsafe(
      'DELETE FROM project_milestones WHERE id = ? AND projectId = ? AND orgId = ?',
      req.params.id, req.params.projectId, req.orgId
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[Milestones] DELETE error:', e.message);
    res.status(500).json({ error: 'Failed to delete milestone' });
  }
});

/** GET /api/projects/milestones/overview — all milestones across all projects, grouped by status */
router.get('/milestones/overview', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureMilestonesTable();
    const orgId = req.orgId;

    // Fetch all milestones with project info
    const milestones = await prisma.$queryRawUnsafe(
      `SELECT pm.id, pm.projectId, pm.name, pm.description, pm.dueDate, pm.status, pm.sortOrder, pm.createdAt, pm.updatedAt,
              p.name AS projectName, p.color AS projectColor, p.priority AS projectPriority
       FROM project_milestones pm
       JOIN projects p ON p.id = pm.projectId
       WHERE pm.orgId = ?
       ORDER BY pm.status ASC, pm.sortOrder ASC`,
      orgId
    );

    // Fetch task counts per milestone
    let taskCounts = [];
    try {
      taskCounts = await prisma.$queryRawUnsafe(
        `SELECT milestoneId,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgress
         FROM macro_tasks
         WHERE milestoneId IS NOT NULL AND orgId = ?
         GROUP BY milestoneId`,
        orgId
      );
    } catch (_) {}

    const countMap = {};
    for (const tc of taskCounts) {
      countMap[tc.milestoneId] = {
        total: Number(tc.total),
        completed: Number(tc.completed),
        inProgress: Number(tc.inProgress),
      };
    }

    // Fetch task previews for active milestones (up to 3 per milestone)
    // If showAll=true (admin view), also fetch previews for upcoming milestones
    const showAll = req.query.showAll === 'true';
    const previewStatuses = showAll ? ['active', 'pending'] : ['active'];
    const activeMilestoneIds = milestones.filter(m => previewStatuses.includes(m.status)).map(m => m.id);
    let taskPreviews = {};
    if (activeMilestoneIds.length > 0) {
      try {
        const aph = activeMilestoneIds.map(() => '?').join(',');
        const previewRows = await prisma.$queryRawUnsafe(
          `SELECT t.id, t.title, t.status, t.priority, t.milestoneId,
                  u.name AS assigneeName, u.image AS assigneeImage
           FROM macro_tasks t
           LEFT JOIN User u ON u.id = t.userId
           WHERE t.milestoneId IN (${aph}) AND t.status != 'completed' AND t.status != 'cancelled'
           ORDER BY t.priority DESC, t.createdAt ASC`,
          ...activeMilestoneIds
        );
        for (const row of previewRows) {
          if (!taskPreviews[row.milestoneId]) taskPreviews[row.milestoneId] = [];
          if (taskPreviews[row.milestoneId].length < 3) {
            taskPreviews[row.milestoneId].push(row);
          }
        }
      } catch (_) {}
    }

    // Group by status
    const currently = [];
    const completed = [];
    const upcoming = [];

    for (const m of milestones) {
      const counts = countMap[m.id] || { total: 0, completed: 0, inProgress: 0 };
      const enriched = {
        id: m.id,
        projectId: m.projectId,
        projectName: m.projectName,
        projectColor: m.projectColor,
        projectPriority: m.projectPriority,
        name: m.name,
        description: m.description,
        dueDate: m.dueDate,
        status: m.status,
        sortOrder: m.sortOrder,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        taskTotal: counts.total,
        taskCompleted: counts.completed,
        taskInProgress: counts.inProgress,
        taskPreviews: taskPreviews[m.id] || [],
      };

      if (m.status === 'active') currently.push(enriched);
      else if (m.status === 'completed') completed.push(enriched);
      else upcoming.push(enriched);
    }

    res.json({ success: true, currently, completed, upcoming });
  } catch (e) {
    console.error('[Milestones] overview error:', e.message);
    res.status(500).json({ error: 'Failed to fetch milestones overview' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT FILE SHARING
// ─────────────────────────────────────────────────────────────────────────────

let projectAttachmentsReady = false;
async function ensureProjectAttachmentsTable() {
  if (projectAttachmentsReady) return;
  try {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS `project_attachments` (' +
      '  `id` VARCHAR(191) NOT NULL,' +
      '  `projectId` VARCHAR(50) NOT NULL,' +
      '  `orgId` VARCHAR(191) NOT NULL,' +
      '  `userId` VARCHAR(36) NOT NULL,' +
      '  `name` VARCHAR(500) NOT NULL,' +
      '  `mimeType` VARCHAR(100) NOT NULL DEFAULT \'application/octet-stream\',' +
      '  `size` INT NOT NULL DEFAULT 0,' +
      '  `data` LONGTEXT NOT NULL,' +
      '  `category` VARCHAR(50) NOT NULL DEFAULT \'project_file\',' +
      '  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),' +
      '  PRIMARY KEY (`id`),' +
      '  KEY `pa_projectId_idx` (`projectId`),' +
      '  KEY `pa_orgId_idx` (`orgId`),' +
      '  KEY `pa_userId_idx` (`userId`)' +
      ') DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
  } catch (_) {}
  projectAttachmentsReady = true;
}

import { randomUUID } from 'crypto';

/** GET /api/projects/:projectId/files — list project files (no data field) */
router.get('/:projectId/files', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureProjectAttachmentsTable();
    const files = await prisma.$queryRawUnsafe(
      `SELECT pa.id, pa.name, pa.mimeType, pa.size, pa.category, pa.createdAt, pa.userId,
              u.name AS userName, u.email AS userEmail
       FROM project_attachments pa
       LEFT JOIN users u ON u.id = pa.userId
       WHERE pa.projectId = ? AND pa.orgId = ?
       ORDER BY pa.createdAt DESC`,
      req.params.projectId, req.orgId
    );
    res.json({ success: true, files });
  } catch (e) {
    console.error('[Projects] files list error:', e.message);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
});

/** POST /api/projects/:projectId/files — upload a file */
router.post('/:projectId/files', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureProjectAttachmentsTable();
    const { name, mimeType, size, data, category } = req.body;
    if (!name || !data) return res.status(400).json({ error: 'name and data are required' });

    // Verify project belongs to org
    const project = await prisma.project.findFirst({ where: { id: req.params.projectId, orgId: req.orgId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const id = randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO project_attachments (id, projectId, orgId, userId, name, mimeType, size, data, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, req.params.projectId, req.orgId, req.user.id,
      name, mimeType || 'application/octet-stream', size || 0, data, category || 'project_file'
    );

    console.log(`📎 Project file uploaded: "${name}" to ${project.name} by ${req.user.email}`);

    // Notify project members (admins + assigned staff)
    try {
      const admins = await prisma.membership.findMany({
        where: { orgId: req.orgId, role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true },
      });
      const uploaderName = (await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } }))?.name || 'Someone';
      for (const { userId } of admins) {
        if (userId !== req.user.id) {
          createNotification({
            userId,
            orgId: req.orgId,
            title: `New File: ${name}`,
            body: `${uploaderName} uploaded "${name}" to ${project.name}.`,
            type: 'info',
            link: '/projects',
          });
        }
      }
    } catch (_) {}

    res.status(201).json({ success: true, file: { id, name, mimeType, size, category } });
  } catch (e) {
    console.error('[Projects] file upload error:', e.message);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

/** GET /api/projects/:projectId/files/:fileId/download — download with data */
router.get('/:projectId/files/:fileId/download', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureProjectAttachmentsTable();
    const rows = await prisma.$queryRawUnsafe(
      'SELECT * FROM project_attachments WHERE id = ? AND projectId = ? AND orgId = ? LIMIT 1',
      req.params.fileId, req.params.projectId, req.orgId
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });
    res.json({ success: true, file: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Failed to download file' });
  }
});

/** DELETE /api/projects/:projectId/files/:fileId — delete (uploader or admin) */
router.delete('/:projectId/files/:fileId', requireAuth, withOrgScope, async (req, res) => {
  try {
    await ensureProjectAttachmentsTable();
    const rows = await prisma.$queryRawUnsafe(
      'SELECT userId FROM project_attachments WHERE id = ? AND projectId = ? AND orgId = ? LIMIT 1',
      req.params.fileId, req.params.projectId, req.orgId
    );
    if (!rows.length) return res.status(404).json({ error: 'File not found' });

    // Allow uploader or admin/owner to delete
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: req.user.id, orgId: req.orgId } },
      select: { role: true },
    });
    const isAdmin = ['OWNER', 'ADMIN'].includes(membership?.role || '');
    if (rows[0].userId !== req.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Only the uploader or an admin can delete this file' });
    }

    await prisma.$executeRawUnsafe(
      'DELETE FROM project_attachments WHERE id = ? AND orgId = ?',
      req.params.fileId, req.orgId
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

export default router;