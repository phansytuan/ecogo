import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _codeStage = false;
  String? _devCode;
  bool _loading = false;

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final phone = _phone.text.trim();
    if (!RegExp(r'^(0|\+84)\d{9,10}$').hasMatch(phone)) {
      showSnack(context, 'Số điện thoại không hợp lệ (VD: 0912345678)', error: true);
      return;
    }
    setState(() => _loading = true);
    try {
      final dev = await context.read<AppState>().requestOtp(phone);
      if (mounted) setState(() { _devCode = dev; _codeStage = true; });
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verify() async {
    final code = _code.text.trim();
    if (code.length != 6) {
      showSnack(context, 'Mã OTP gồm 6 chữ số', error: true);
      return;
    }
    setState(() => _loading = true);
    try {
      await context.read<AppState>().verifyOtp(_phone.text.trim(), code);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Đăng nhập thất bại', error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: FadeInSlide(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Container(
                  width: 64, height: 64,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [ecogoGreen, ecogoGreenLight]),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(Icons.eco, color: Colors.white, size: 34),
                ),
                const SizedBox(height: 18),
                const Text('ECOGO',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: ecogoGreen)),
                const SizedBox(height: 4),
                Text('Đi chung, tiết kiệm, xanh hơn',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.black.withOpacity(0.5))),
                const SizedBox(height: 32),
                if (!_codeStage) ...[
                  TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Số điện thoại', prefixIcon: Icon(Icons.phone)),
                    onSubmitted: (_) => _send(),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: _loading ? null : _send,
                    child: _loading
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Gửi mã OTP'),
                  ),
                ] else ...[
                  if (_devCode != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(color: const Color(0xFFD7EFE0), borderRadius: BorderRadius.circular(10)),
                      child: Text('Mã dev: $_devCode', style: const TextStyle(color: Color(0xFF1F6B45))),
                    ),
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    autofocus: true,
                    decoration: const InputDecoration(labelText: 'Mã OTP', prefixIcon: Icon(Icons.lock_outline)),
                    onSubmitted: (_) => _verify(),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: _loading ? null : _verify,
                    child: _loading
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Đăng nhập'),
                  ),
                  TextButton(
                    onPressed: _loading ? null : () => setState(() => _codeStage = false),
                    child: const Text('Đổi số điện thoại'),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
