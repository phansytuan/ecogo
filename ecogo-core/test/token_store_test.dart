import 'package:ecogo_core/ecogo_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('TokenStore', () {
    test('create with empty storage has no session', () async {
      final kv = InMemorySecureKV();
      final store = await TokenStore.create(storage: kv);

      expect(store.access, isNull);
      expect(store.refresh, isNull);
      expect(store.userId, isNull);
    });

    test('setSession updates the cache and secure storage', () async {
      final kv = InMemorySecureKV();
      final store = await TokenStore.create(storage: kv);

      await store.setSession('access-a', 'refresh-r', 'user-u');

      expect(store.access, 'access-a');
      expect(store.refresh, 'refresh-r');
      expect(store.userId, 'user-u');
      expect(await kv.read('token'), 'access-a');
      expect(await kv.read('refresh'), 'refresh-r');
      expect(await kv.read('uid'), 'user-u');
    });

    test('clear removes the cached and persisted session', () async {
      final kv = InMemorySecureKV();
      final store = await TokenStore.create(storage: kv);
      await store.setSession('access-a', 'refresh-r', 'user-u');
      await store.clear();

      expect(store.access, isNull);
      expect(store.refresh, isNull);
      expect(store.userId, isNull);
      expect(await kv.read('token'), isNull);
      expect(await kv.read('refresh'), isNull);
      expect(await kv.read('uid'), isNull);
    });

    test('migrates and removes a complete legacy session', () async {
      SharedPreferences.setMockInitialValues({
        'token': 'legacy-a',
        'refresh': 'legacy-r',
        'uid': 'legacy-u',
      });
      final prefs = await SharedPreferences.getInstance();
      final kv = InMemorySecureKV();
      final store = await TokenStore.create(
        storage: kv,
        legacyPrefs: prefs,
      );

      expect(store.access, 'legacy-a');
      expect(store.refresh, 'legacy-r');
      expect(store.userId, 'legacy-u');
      expect(await kv.read('token'), 'legacy-a');
      expect(await kv.read('refresh'), 'legacy-r');
      expect(await kv.read('uid'), 'legacy-u');
      expect(prefs.getString('token'), isNull);
    });

    test('does not migrate over an existing secure session', () async {
      SharedPreferences.setMockInitialValues({
        'token': 'legacy-a',
        'refresh': 'legacy-r',
      });
      final prefs = await SharedPreferences.getInstance();
      final kv = InMemorySecureKV();
      await kv.write('token', 'secure-a');
      await kv.write('refresh', 'secure-r');
      final store = await TokenStore.create(
        storage: kv,
        legacyPrefs: prefs,
      );

      expect(store.access, 'secure-a');
      expect(store.refresh, 'secure-r');
      expect(prefs.getString('token'), 'legacy-a');
    });
  });
}
