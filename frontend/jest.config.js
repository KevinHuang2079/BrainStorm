module.exports = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/test'],  // tell Jest where to look

  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  modulePaths: ['<rootDir>/src'],
  moduleDirectories: ['node_modules'],  // keep this simple — just root node_modules

  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(png|jpg|jpeg|gif|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },

  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
  },

  transformIgnorePatterns: [
    '/node_modules/(?!(axios)/)',
  ],

  testPathIgnorePatterns: ['/node_modules/', '/build/'],
};