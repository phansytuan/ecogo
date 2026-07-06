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

  Future<void> _send() async {
    if (_phone.text.trim().isEmpty) return;
    setState(() => _loading = true);
    try {
      final dev = await context.read<AppState>().requestOtp(_phone.text.trim());
      if (mounted) setState(() { _devCode = dev; _codeStage = true; });
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Không gửi được mã OTP', error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verify() async {
    if (_code.text.trim().isEmpty) return;
    setState(() => _loading = true);
    try {
      await context.read<AppState>().verifyOtp(_phone.text.trim(), _code.text.trim());
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Đăng nhập thất bại', error: true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  void dispose() {
    _phone.dispose();
    _code.dispose();
    super.dispose();
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
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(colors: [ecogoGreen, ecogoGreenLight]),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  child: const Icon(Icons.directions_car_filled, color: Colors.white, size: 32),
                ),
                const SizedBox(height: 18),
                const Text('ECOGO Tài xế',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: ecogoGreen)),
                const SizedBox(height: 4),
                Text('Đăng chuyến, đón khách dọc tuyến',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.black.withOpacity(0.5))),
                const SizedBox(height: 32),
                if (!_codeStage) ...[
                  TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                        labelText: 'Số điện thoại', prefixIcon: Icon(Icons.phone)),
                    onSubmitted: (_) => _send(),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: _loading ? null : _send,
                    child: _loading
                        ? const SizedBox(
                            width: 20, height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                        : const Text('Gửi mã OTP'),
                  ),
                ] else ...[
                  if (_devCode != null)
                    Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                          color: const Color(0xFFD7EFE0), borderRadius: BorderRadius.circular(10)),
                      child: Text('Mã dev: $_devCode', style: const TextStyle(color: Color(0xFF1F6B45))),
                    ),
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    autofocus: true,
                    decoration: const InputDecoration(
                        labelText: 'Mã OTP', prefixIcon: Icon(Icons.lock_outline)),
                    onSubmitted: (_) => _verify(),
                  ),
                  const SizedBox(height: 14),
                  FilledButton(
                    onPressed: _loading ? null : _verify,
                    child: _loading
                        ? const SizedBox(
                            width: 20, height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
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
