// backend/lib/google-calendar.js
// Google Calendar v3 integration — reads/writes tokens from user_google_tokens

import { google } from 'googleapis';
import { prisma } from './prisma.js';

// ── Token table helpers ────────────────────────────────────────────────────────

async function getStoredToken(userId) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      'SELECT * FROM user_google_tokens WHERE userId = ? LIMIT 1',
      userId
    );
    return rows[0] || null;
  } catch {
    return null;
  }
}

async function saveToken(userId, { accessToken, refreshToken, expiresAt }) {
  try {
    await prisma.$executeRawUnsafe(
      'INSERT INTO user_google_tokens (userId, accessToken, refreshToken, expiresAt, scope, updatedAt) ' +
      'VALUES (?, ?, ?, ?, ?, NOW(3)) ON DUPLICATE KEY UPDATE ' +
      'accessToken = VALUES(accessToken), ' +
      'refreshToken = COALESCE(VALUES(refreshToken), refreshToken), ' +
      'expiresAt = VALUES(expiresAt), updatedAt = NOW(3)',
      userId,
      accessToken,
      refreshToken || null,
      expiresAt ? new Date(expiresAt) : null,
      'calendar'
    );
  } catch (err) {
    console.error('[GoogleCal] saveToken error:', err.message);
  }
}

// ── Auth client ───────────────────────────────────────────────────────────────

/**
 * Build an authenticated OAuth2 client for a given userId.
 * Reads tokens from user_google_tokens (NOT better-auth's account table).
 * Auto-refreshes expired tokens and persists the new token.
 * Returns null if no token exists.
 */
export async function getGoogleAuthClient(userId) {
  const token = await getStoredToken(userId);
  if (!token || !token.accessToken) return null;

  const backendUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3001';

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${backendUrl}/api/integrations/google/callback`
  );

  // Auto-refresh if expired (5-minute buffer)
  const expiresAt = token.expiresAt ? new Date(token.expiresAt).getTime() : 0;
  const isExpired = expiresAt > 0 && expiresAt - Date.now() < 5 * 60 * 1000;

  if (isExpired && token.refreshToken) {
    try {
      oauth2Client.setCredentials({ refresh_token: token.refreshToken });
      const { credentials } = await oauth2Client.refreshAccessToken();
      await saveToken(userId, {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || token.refreshToken,
        expiresAt: credentials.expiry_date,
      });
      oauth2Client.setCredentials(credentials);
    } catch (err) {
      console.error('[GoogleCal] Token refresh failed:', err.message);
      return null;
    }
  } else {
    oauth2Client.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken || undefined,
    });
  }

  return oauth2Client;
}

/**
 * Returns true if the user has a valid Google Calendar token.
 */
export async function hasGoogleCalendarAccess(userId) {
  const token = await getStoredToken(userId);
  return !!(token && token.accessToken);
}

// ── Calendar operations ───────────────────────────────────────────────────────

/**
 * Create an event on the user's primary Google Calendar with a Meet link.
 * Returns { googleEventId, googleCalendarId, meetLink } or { error }.
 */
export async function createGoogleCalendarEvent(userId, eventData) {
  const auth = await getGoogleAuthClient(userId);
  if (!auth) return { error: 'google_not_connected' };

  const calendar = google.calendar({ version: 'v3', auth });

  const resource = {
    summary: eventData.title,
    description: eventData.description || undefined,
    location: eventData.location || undefined,
    colorId: hexToGoogleColorId(eventData.color),
    start: eventData.allDay
      ? { date: toDateString(eventData.startAt) }
      : { dateTime: new Date(eventData.startAt).toISOString() },
    end: eventData.allDay
      ? { date: toDateString(addDay(eventData.endAt)) } // Google all-day end is exclusive
      : { dateTime: new Date(eventData.endAt).toISOString() },
    conferenceData: {
      createRequest: {
        requestId: `eversense-${Date.now()}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    attendees: (eventData.attendeeEmails || []).map(email => ({ email })),
  };

  try {
    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
    });

    const evt = response.data;
    const meetLink =
      evt.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;

    return {
      googleEventId: evt.id,
      googleCalendarId: 'primary',
      meetLink,
    };
  } catch (err) {
    console.error('[GoogleCal] insert error:', err.message);
    return { error: err.message };
  }
}

/**
 * Patch an existing Google Calendar event.
 */
export async function updateGoogleCalendarEvent(userId, googleEventId, googleCalendarId, eventData) {
  const auth = await getGoogleAuthClient(userId);
  if (!auth) return { error: 'google_not_connected' };

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    await calendar.events.patch({
      calendarId: googleCalendarId || 'primary',
      eventId: googleEventId,
      resource: {
        summary: eventData.title,
        description: eventData.description || undefined,
        location: eventData.location || undefined,
        colorId: hexToGoogleColorId(eventData.color),
        start: eventData.allDay
          ? { date: toDateString(eventData.startAt) }
          : { dateTime: new Date(eventData.startAt).toISOString() },
        end: eventData.allDay
          ? { date: toDateString(addDay(eventData.endAt)) }
          : { dateTime: new Date(eventData.endAt).toISOString() },
      },
      sendUpdates: 'all',
    });
    return { success: true };
  } catch (err) {
    console.error('[GoogleCal] patch error:', err.message);
    return { error: err.message };
  }
}

/**
 * Delete a Google Calendar event. Handles 410 (already deleted) gracefully.
 */
export async function deleteGoogleCalendarEvent(userId, googleEventId, googleCalendarId) {
  const auth = await getGoogleAuthClient(userId);
  if (!auth) return { error: 'google_not_connected' };

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    await calendar.events.delete({
      calendarId: googleCalendarId || 'primary',
      eventId: googleEventId,
      sendUpdates: 'all',
    });
    return { success: true };
  } catch (err) {
    if (err?.code === 410 || err?.status === 410) return { success: true }; // already gone
    console.error('[GoogleCal] delete error:', err.message);
    return { error: err.message };
  }
}

/**
 * List events from Google Calendar in a date range.
 * Returns FullCalendar-compatible objects: id prefixed gcal_, color #4285F4.
 */
export async function listGoogleCalendarEvents(userId, startIso, endIso) {
  const auth = await getGoogleAuthClient(userId);
  if (!auth) return [];

  const calendar = google.calendar({ version: 'v3', auth });

  try {
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startIso,
      timeMax: endIso,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
    });

    const items = response.data.items || [];

    return items.map(evt => {
      const isAllDay = !!evt.start?.date;
      const start = isAllDay ? evt.start.date : evt.start?.dateTime;
      const end   = isAllDay ? evt.end?.date  : evt.end?.dateTime;
      const meetLink = evt.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null;

      return {
        id: `gcal_${evt.id}`,
        title: evt.summary || '(no title)',
        start,
        end,
        allDay: isAllDay,
        color: '#4285F4',
        extendedProps: {
          description:      evt.description || null,
          location:         evt.location || null,
          meetLink,
          createdById:      userId,
          syncedToGoogle:   true,
          googleEventId:    evt.id,
          googleCalendarId: 'primary',
          attendees:        [],
          isGoogleEvent:    true,
        },
      };
    });
  } catch (err) {
    console.error('[GoogleCal] list error:', err.message);
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateString(d) {
  return new Date(d).toISOString().split('T')[0];
}

function addDay(d) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + 1);
  return dt;
}

const HEX_TO_COLOR_ID = {
  '#007acc': '1',  // Peacock
  '#4ec9b0': '7',  // Sage
  '#6a9955': '2',  // Sage (green)
  '#dcdcaa': '5',  // Banana
  '#ce9178': '6',  // Tangerine
  '#f44747': '11', // Tomato
  '#c586c0': '3',  // Grape
  '#569cd6': '9',  // Blueberry
};

function hexToGoogleColorId(hex) {
  return HEX_TO_COLOR_ID[(hex || '').toLowerCase()] || '1';
}
