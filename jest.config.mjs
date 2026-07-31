// Jest configuration for the custom site JavaScript.
//
// The modules under www/js/ are real ES modules (loaded in the browser via
// <script type="module">). The root package is "type": "commonjs" (the
// default), so www/js/package.json declares that subtree as ESM and we run Jest in
// native-ESM mode -- no Babel transform, no extra dependencies. The npm "test"
// script supplies the required `node --experimental-vm-modules` flag.
//
// Tests run in the plain "node" environment (no jsdom dependency); the few
// browser globals the tested modules touch (sessionStorage, document, Image,
// navigator) are stubbed per-test inside the specs.
export default {
  testEnvironment: 'node',
  // Disable the default babel-jest transform: sources are already ESM and need
  // no transpilation, and the module-transform Babel preset isn't installed.
  transform: {},
  testMatch: ['**/tests/**/*.test.mjs'],
  // Use Node's built-in V8 coverage. The default 'babel' provider instruments
  // via a Babel transform, which we don't have (transform is disabled and no
  // Babel is installed); 'v8' needs neither, keeping the zero-dependency setup.
  coverageProvider: 'v8',
  // Report on the hand-written ES module sources only -- never the generated
  // *.min.js bundles. All custom JS lives in a js/ folder (site-wide www/js,
  // shared parts www/shared/js, and each experience's www/<name>/js), so two
  // globs cover everything, and untested files show up at 0% so the report
  // doubles as a map of what still needs tests.
  collectCoverageFrom: [
    'www/js/*.js',
    'www/*/js/*.js',
    '!**/*.min.js',
  ],
  // Fail any coverage run (CI uses `npm run test:coverage`) that dips below
  // these floors. Jest removes files matched by a path-specific entry from
  // the global pool, so this reads as: the site JS and the shared parts
  // library are held to the strict floors (they sit near 100% today, the gap
  // is headroom for honest churn), while `global` is left holding only the
  // per-experience code, which gets a gentler floor sized for init smoke
  // tests rather than exhaustive suites.
  coverageThreshold: {
    './www/js/': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
    './www/shared/js/': {
      statements: 95,
      branches: 90,
      functions: 95,
      lines: 95,
    },
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
};
