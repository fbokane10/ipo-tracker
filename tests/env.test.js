const { NODE_ENV } = process.env;
test('env', () => {
  expect(NODE_ENV).toBe('test');
});
