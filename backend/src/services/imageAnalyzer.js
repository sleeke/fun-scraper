'use strict';

const axios = require('axios');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o';

const ANALYSIS_PROMPT = `You are analyzing an event flyer image. Extract the following information and return ONLY valid JSON (no markdown, no explanation):
{
  "genres": ["list", "of", "music", "genres"],
  "artists": ["list", "of", "artist", "or", "dj", "names"],
  "vibe": "one of: chill, energetic, dark, uplifting, eclectic",
  "description": "one sentence summarizing what you see on the flyer"
}

Rules:
- genres: music genres visible or strongly implied by the flyer style (e.g. electronic, techno, house, hip-hop, rock, jazz)
- artists: any performer, DJ, or band names readable in the flyer
- vibe: your overall impression of the event atmosphere
- description: brief plain-English summary of the flyer
- If you cannot determine a field, use an empty array [] or empty string ""
- Return ONLY the JSON object, nothing else`;

/**
 * Analyze an event flyer image URL using OpenAI GPT-4o Vision.
 * Requires OPENAI_API_KEY environment variable.
 *
 * @param {string} imageUrl - Publicly accessible image URL
 * @returns {Promise<{genres: string[], artists: string[], vibe: string, description: string}>}
 */
async function analyzeImage(imageUrl) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured');
    err.statusCode = 503;
    throw err;
  }

  const response = await axios.post(
    OPENAI_API_URL,
    {
      model: MODEL,
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: imageUrl, detail: 'low' },
            },
            {
              type: 'text',
              text: ANALYSIS_PROMPT,
            },
          ],
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const content = response.data.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Attempt to extract JSON from markdown code block
    const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      parsed = JSON.parse(match[1].trim());
    } else {
      throw new Error('Could not parse analysis response as JSON');
    }
  }

  return {
    genres: Array.isArray(parsed.genres) ? parsed.genres.map(String) : [],
    artists: Array.isArray(parsed.artists) ? parsed.artists.map(String) : [],
    vibe: typeof parsed.vibe === 'string' ? parsed.vibe : '',
    description: typeof parsed.description === 'string' ? parsed.description : '',
  };
}

module.exports = { analyzeImage };
