const axios = require('axios');
const { scrape } = require('../scrapers/residentadvisor');

jest.mock('axios');

describe('Resident Advisor scraper – unit (mocked)', () => {
  afterEach(() => jest.resetAllMocks());

  test('uses Vancouver numeric area ID fallback when lookupAreaId fails', async () => {
    axios.get
      .mockResolvedValueOnce({
        headers: { 'set-cookie': ['session=abc; Path=/; HttpOnly'] },
        data: '<html></html>',
      })
      .mockResolvedValueOnce({
        headers: {},
        data: '<html><body>No __NEXT_DATA__</body></html>',
      });

    axios.post.mockResolvedValueOnce({
      data: {
        data: {
          eventListings: {
            data: [{
              listingDate: '2026-06-01',
              event: {
                id: 12345,
                title: 'Fallback Test Event',
                date: '2026-06-02',
                startTime: '22:00:00',
                contentUrl: '/events/12345',
                artists: [{ name: 'Test DJ' }],
                genres: [{ name: 'Techno' }],
                venue: {
                  name: 'Test Venue',
                  address: 'Vancouver, BC, Canada',
                },
                pick: { blurb: 'Great night' },
              },
            }],
          },
        },
      },
    });

    const events = await scrape('https://ra.co/events/ca/vancouver');

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [, requestBody] = axios.post.mock.calls[0];
    expect(requestBody?.operationName).toBe('GET_EVENT_LISTINGS');
    expect(requestBody?.variables?.filters?.areas?.eq).toBe(39);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      source: 'residentadvisor',
      source_id: '12345',
      title: 'Fallback Test Event',
      venue: 'Test Venue',
      city: 'Vancouver',
    });
  });
});
