module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready',
      url: ['http://127.0.0.1:3000/'],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--headless --no-sandbox',
      },
    },
    assert: {
      assertions: {
        // Hard regression gates. The normal score is currently much higher,
        // but these limits avoid flaky failures from one slower CI run.
        'categories:performance': ['error', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'first-contentful-paint': ['error', { maxNumericValue: 1800 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 3500 }],
        'total-blocking-time': ['error', { maxNumericValue: 600 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
}
