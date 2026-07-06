class Config {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:3000/api',
  );
  static const wsBase = String.fromEnvironment(
    'WS_BASE',
    defaultValue: 'http://10.0.2.2:3000',
  );
}
