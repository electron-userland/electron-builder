module.exports = {
  collectCoverage: true,
  transform: { '^.+\\.ts$': 'ts-jest' },
  moduleFileExtensions: ['js', 'ts'],
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  globals: {
    'ts-jest': {
      tsConfigFile: './tsconfig.json',
    },
  },
};
