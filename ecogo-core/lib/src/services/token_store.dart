import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract class SecureKV {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class FlutterSecureKV implements SecureKV {
  static const FlutterSecureStorage _s = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  @override
  Future<String?> read(String key) => _s.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _s.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _s.delete(key: key);
}

class InMemorySecureKV implements SecureKV {
  final Map<String, String> _values = {};

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async {
    _values[key] = value;
  }

  @override
  Future<void> delete(String key) async {
    _values.remove(key);
  }
}

/// Secure token persistence with synchronous, write-through cached getters.
///
/// [create] loads secure storage before application state is constructed and
/// silently migrates one legacy SharedPreferences session when supplied.
class TokenStore {
  static const _kAccess = 'token';
  static const _kRefresh = 'refresh';
  static const _kUid = 'uid';

  final SecureKV _kv;
  String? _access;
  String? _refresh;
  String? _uid;

  TokenStore._(this._kv);

  static Future<TokenStore> create({
    SecureKV? storage,
    SharedPreferences? legacyPrefs,
  }) async {
    final store = TokenStore._(storage ?? FlutterSecureKV());
    store._access = await store._kv.read(_kAccess);
    store._refresh = await store._kv.read(_kRefresh);
    store._uid = await store._kv.read(_kUid);

    if (store._access == null && legacyPrefs != null) {
      final legacyAccess = legacyPrefs.getString(_kAccess);
      final legacyRefresh = legacyPrefs.getString(_kRefresh);
      final legacyUid = legacyPrefs.getString(_kUid);
      if (legacyAccess != null && legacyRefresh != null) {
        await store.setSession(legacyAccess, legacyRefresh, legacyUid);
        await legacyPrefs.remove(_kAccess);
        await legacyPrefs.remove(_kRefresh);
        await legacyPrefs.remove(_kUid);
      }
    }

    return store;
  }

  String? get access => _access;
  String? get refresh => _refresh;
  String? get userId => _uid;

  Future<void> setSession(
    String access,
    String refresh, [
    String? uid,
  ]) async {
    _access = access;
    _refresh = refresh;
    if (uid != null) _uid = uid;

    await _kv.write(_kAccess, access);
    await _kv.write(_kRefresh, refresh);
    if (uid != null) await _kv.write(_kUid, uid);
  }

  Future<void> clear() async {
    _access = null;
    _refresh = null;
    _uid = null;

    await _kv.delete(_kAccess);
    await _kv.delete(_kRefresh);
    await _kv.delete(_kUid);
  }
}
