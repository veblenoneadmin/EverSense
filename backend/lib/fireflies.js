// backend/lib/fireflies.js — Fireflies.ai GraphQL client

const FIREFLIES_API = 'https://api.fireflies.ai/graphql';

const TRANSCRIPT_QUERY = `
  query Transcript($id: String!) {
    transcript(id: $id) {
      id
      title
      date
      duration
      participants
      summary {
        overview
        action_items
        keywords
        outline
      }
    }
  }
`;

const LATEST_TRANSCRIPTS_QUERY = `
  query {
    transcripts(limit: 20) {
      id
      title
      date
      duration
      participants
      summary {
        overview
        action_items
        keywords
        outline
      }
    }
  }
`;

/**
 * Fetch a single transcript (with summary) from Fireflies.
 * @param {string} meetingId — the Fireflies transcript/meeting ID
 * @returns {object|null} transcript object or null on error
 */
export async function fetchTranscript(meetingId) {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    console.warn('[Fireflies] FIREFLIES_API_KEY not set — skipping');
    return null;
  }

  const res = await fetch(FIREFLIES_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: TRANSCRIPT_QUERY,
      variables: { id: meetingId },
    }),
  });

  if (!res.ok) {
    throw new Error(`Fireflies API HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Fireflies GraphQL: ${json.errors[0].message}`);
  }

  return json.data?.transcript ?? null;
}

/**
 * Fetch the latest transcripts (up to 20) from Fireflies.
 * @returns {Array} array of transcript objects or empty array
 */
export async function fetchLatestTranscripts() {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    console.warn('[Fireflies] FIREFLIES_API_KEY not set — skipping poll');
    return [];
  }

  const res = await fetch(FIREFLIES_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: LATEST_TRANSCRIPTS_QUERY }),
  });

  if (!res.ok) throw new Error(`Fireflies API HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`Fireflies GraphQL: ${json.errors[0].message}`);
  return json.data?.transcripts ?? [];
}
