// ── Security middleware: anti-bypass, injection rejection, rate limiting ──
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import hpp from 'hpp';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Helmet — sets security HTTP headers (XSS, clickjacking, MIME sniffing, etc.)
// ═══════════════════════════════════════════════════════════════════════════════
export const securityHeaders = helmet({
  contentSecurityPolicy: false, // handled by frontend framework
  crossOriginEmbedderPolicy: false, // allow cross-origin resources
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Rate limiters — prevent brute force and abuse
// ═══════════════════════════════════════════════════════════════════════════════

// General API rate limit: 200 requests per minute per IP
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
  keyGenerator: ipKeyGenerator,
});

// Auth endpoints: 10 attempts per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again in 15 minutes', code: 'AUTH_RATE_LIMITED' },
  keyGenerator: ipKeyGenerator,
});

// Password reset: 5 attempts per 30 minutes per IP
export const passwordResetLimiter = rateLimit({
  windowMs: 30 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset attempts, please try again later', code: 'RESET_RATE_LIMITED' },
  keyGenerator: ipKeyGenerator,
});

// External API: 100 requests per minute per API key
export const extApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'API rate limit exceeded', code: 'API_RATE_LIMITED' },
  keyGenerator: (req) => req.headers['authorization'] || ipKeyGenerator(req),
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. HTTP Parameter Pollution protection
// ═══════════════════════════════════════════════════════════════════════════════
export const parameterPollution = hpp();

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Input sanitization — strip SQL injection, XSS, and code injection patterns
// ═══════════════════════════════════════════════════════════════════════════════

// Patterns that indicate injection attempts
const SQL_INJECTION_PATTERNS = [
  /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE)\b\s+(ALL\s+)?SELECT\b)/i,
  /(\b(UNION)\s+(ALL\s+)?SELECT\b)/i,
  /(;\s*(DROP|ALTER|CREATE|TRUNCATE|DELETE)\s)/i,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i,            // OR 1=1
  /(\bAND\b\s+\d+\s*=\s*\d+)/i,           // AND 1=1
  /(--\s*$)/m,                              // SQL comment at end of line
  /(\/\*[\s\S]*?\*\/)/,                     // SQL block comment
  /(\bWAITFOR\b\s+\bDELAY\b)/i,           // Time-based injection
  /(\bBENCHMARK\b\s*\()/i,                 // MySQL benchmark
  /(\bSLEEP\b\s*\()/i,                     // MySQL sleep
  /(\bLOAD_FILE\b\s*\()/i,                 // File read
  /(\bINTO\s+(OUT|DUMP)FILE\b)/i,          // File write
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /javascript\s*:/i,
  /on(error|load|click|mouse|focus|blur|key|submit|change|input)\s*=/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /<svg[\s>].*?on\w+\s*=/i,
  /\beval\s*\(/i,
  /\bdocument\s*\.\s*(cookie|write|location)/i,
  /\bwindow\s*\.\s*location/i,
];

const CODE_INJECTION_PATTERNS = [
  /\brequire\s*\(\s*['"][^'"]*['"]\s*\)/,  // Node.js require()
  /\bimport\s*\(\s*['"][^'"]*['"]\s*\)/,    // Dynamic import()
  /\bchild_process\b/,
  /\bprocess\s*\.\s*env\b/,                 // env access attempt
  /\b__proto__\b/,                           // Prototype pollution
  /\bconstructor\s*\[/,                      // Constructor access
  /\{\s*\$\s*(gt|gte|lt|lte|ne|in|nin|regex|where|exists)\s*:/,  // NoSQL injection
];

/**
 * Check a string for injection patterns
 * Returns the type of injection detected or null if clean
 */
function detectInjection(value) {
  if (typeof value !== 'string') return null;

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) return 'SQL_INJECTION';
  }
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) return 'XSS';
  }
  for (const pattern of CODE_INJECTION_PATTERNS) {
    if (pattern.test(value)) return 'CODE_INJECTION';
  }
  return null;
}

/**
 * Recursively scan an object for injection patterns
 */
function scanObject(obj, path = '') {
  if (!obj || typeof obj !== 'object') {
    return detectInjection(obj);
  }

  // Protect against prototype pollution
  if (path.includes('__proto__') || path.includes('constructor') || path.includes('prototype')) {
    return 'PROTOTYPE_POLLUTION';
  }

  for (const [key, value] of Object.entries(obj)) {
    // Check key names for injection
    const keyInjection = detectInjection(key);
    if (keyInjection) return keyInjection;

    if (typeof value === 'string') {
      const injection = detectInjection(value);
      if (injection) return injection;
    } else if (typeof value === 'object' && value !== null) {
      // Limit depth to prevent DoS via deeply nested objects
      if (path.split('.').length > 10) continue;
      const nested = scanObject(value, `${path}.${key}`);
      if (nested) return nested;
    }
  }
  return null;
}

// Paths that should skip injection scanning (they may contain code/HTML legitimately)
const SCAN_SKIP_PATHS = [
  '/api/ai/',            // AI prompts may contain code
  '/api/brain-dump/',    // Brain dumps may contain anything
  '/health',
];

/**
 * Express middleware: scans request body, query, and params for injection
 */
export function inputSanitizer(req, res, next) {
  // Skip safe methods and whitelisted paths
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') {
    return next();
  }

  // Skip paths that legitimately contain code/HTML
  if (SCAN_SKIP_PATHS.some(p => req.path.startsWith(p))) {
    return next();
  }

  // Scan request body
  if (req.body && typeof req.body === 'object') {
    const bodyInjection = scanObject(req.body);
    if (bodyInjection) {
      console.warn(`🚫 [Security] ${bodyInjection} detected in request body — ${req.method} ${req.path} — IP: ${req.ip}`);
      return res.status(400).json({
        error: 'Request rejected: potentially malicious input detected',
        code: 'INJECTION_DETECTED',
      });
    }
  }

  // Scan query parameters
  if (req.query && Object.keys(req.query).length > 0) {
    const queryInjection = scanObject(req.query);
    if (queryInjection) {
      console.warn(`🚫 [Security] ${queryInjection} detected in query params — ${req.method} ${req.path} — IP: ${req.ip}`);
      return res.status(400).json({
        error: 'Request rejected: potentially malicious input detected',
        code: 'INJECTION_DETECTED',
      });
    }
  }

  // Scan URL params
  if (req.params && Object.keys(req.params).length > 0) {
    const paramInjection = scanObject(req.params);
    if (paramInjection) {
      console.warn(`🚫 [Security] ${paramInjection} detected in URL params — ${req.method} ${req.path} — IP: ${req.ip}`);
      return res.status(400).json({
        error: 'Request rejected: potentially malicious input detected',
        code: 'INJECTION_DETECTED',
      });
    }
  }

  next();
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Anti-bypass: block common evasion techniques
// ═══════════════════════════════════════════════════════════════════════════════
export function antiBypass(req, res, next) {
  // Block path traversal attempts
  const decodedPath = decodeURIComponent(req.path);
  if (decodedPath.includes('..') || decodedPath.includes('%2e%2e') || decodedPath.includes('%252e')) {
    console.warn(`🚫 [Security] Path traversal blocked — ${req.path} — IP: ${req.ip}`);
    return res.status(400).json({ error: 'Invalid request path', code: 'PATH_TRAVERSAL' });
  }

  // Block null byte injection
  if (req.path.includes('%00') || req.path.includes('\0')) {
    console.warn(`🚫 [Security] Null byte injection blocked — ${req.path} — IP: ${req.ip}`);
    return res.status(400).json({ error: 'Invalid request path', code: 'NULL_BYTE' });
  }

  // Block double-encoding bypass attempts
  if (/%25[0-9a-fA-F]{2}/.test(req.url)) {
    console.warn(`🚫 [Security] Double-encoding blocked — ${req.url} — IP: ${req.ip}`);
    return res.status(400).json({ error: 'Invalid request encoding', code: 'DOUBLE_ENCODING' });
  }

  // Block HTTP method override attempts (X-HTTP-Method-Override header abuse)
  const methodOverride = req.headers['x-http-method-override'] || req.headers['x-method-override'];
  if (methodOverride) {
    console.warn(`🚫 [Security] Method override blocked — ${methodOverride} — IP: ${req.ip}`);
    return res.status(400).json({ error: 'Method override not allowed', code: 'METHOD_OVERRIDE' });
  }

  // Reject suspiciously large headers (header injection / DoS)
  const totalHeaderSize = Object.entries(req.headers).reduce((sum, [k, v]) => sum + k.length + String(v).length, 0);
  if (totalHeaderSize > 16384) { // 16KB
    console.warn(`🚫 [Security] Oversized headers blocked — ${totalHeaderSize} bytes — IP: ${req.ip}`);
    return res.status(431).json({ error: 'Request header too large', code: 'HEADER_TOO_LARGE' });
  }

  next();
}
