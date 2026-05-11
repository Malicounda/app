module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/server'], // Spécifie le dossier racine pour les tests du serveur
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'server/tsconfig.json', // Spécifie le tsconfig pour le serveur
      useESM: true, // Support ESM pour NodeNext
    }]
  },
  moduleNameMapper: {
    // Mapper pour retirer les suffixes .js injectés par TypeScript NodeNext lors des imports relatifs
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // moduleNameMapper: { // Peut être nécessaire si vous avez des alias de chemin dans tsconfig
  //   '^@/(.*)$': '<rootDir>/src/$1',
  // },
  // collectCoverage: true, // Décommentez pour activer la couverture de code
  // coverageDirectory: "coverage",
  // coverageReporters: ["json", "lcov", "text", "clover"]
};
