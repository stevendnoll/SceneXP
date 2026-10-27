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
  // A SCENE BOOT IS NOT A UNIT TEST. Jest's 5 s default is sized for the
  // latter, and many init tests here boot a whole experience (twelve thousand
  // leaves, a derby hall with its crowd) once or twice inside the sandbox,
  // which runs hot math some sixty times slower than plain Node. Alone, every
  // one passes in a fraction of this. Under the full suite's parallel workers
  // on a busy machine (load 10 on 8 cores, 2026-10-27) two different files
  // tripped the default in two consecutive runs, a load flake each time, not
  // a fault. 20 s is the allowance the heaviest tests already gave themselves.
  testTimeout: 20000,
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
  // doubles as a map of what still needs tests. The third reaches a page that
  // lives inside an experience with scripts of its own (Whitestone's
  // cleaner's page, www/whitestone/tasks/js, 2026-10-12).
  collectCoverageFrom: [
    'www/js/*.js',
    'www/*/js/*.js',
    'www/*/*/js/*.js',
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
