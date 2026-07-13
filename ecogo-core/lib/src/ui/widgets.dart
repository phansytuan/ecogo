import 'package:flutter/material.dart';
import '../services/realtime_service.dart';

/// Fades + slides a child in, optionally after a delay (for staggered lists).
class FadeInSlide extends StatefulWidget {
  final Widget child;
  final Duration delay;
  final double offsetY;
  const FadeInSlide({super.key, required this.child, this.delay = Duration.zero, this.offsetY = 14});

  @override
  State<FadeInSlide> createState() => _FadeInSlideState();
}

class _FadeInSlideState extends State<FadeInSlide> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 360));
  late final Animation<double> _a = CurvedAnimation(parent: _c, curve: Curves.easeOutCubic);

  @override
  void initState() {
    super.initState();
    Future.delayed(widget.delay, () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _a,
      builder: (_, child) => Opacity(
        opacity: _a.value,
        child: Transform.translate(offset: Offset(0, (1 - _a.value) * widget.offsetY), child: child),
      ),
      child: widget.child,
    );
  }
}

/// Staggered helper: returns a list delay for index i.
Duration staggerDelay(int i) => Duration(milliseconds: (i * 55).clamp(0, 400));

class LoadingView extends StatelessWidget {
  final String? label;
  const LoadingView({super.key, this.label});
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(strokeWidth: 2.6),
          if (label != null) ...[
            const SizedBox(height: 14),
            Text(label!, style: TextStyle(color: Colors.black.withValues(alpha: 0.55))),
          ],
        ],
      ),
    );
  }
}

class EmptyState extends StatelessWidget {
  final IconData icon;
  final String message;
  final Widget? action;
  const EmptyState({super.key, required this.icon, required this.message, this.action});
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 46, color: Colors.black.withValues(alpha: 0.22)),
            const SizedBox(height: 14),
            Text(message,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black.withValues(alpha: 0.55), fontSize: 14)),
            if (action != null) ...[const SizedBox(height: 18), action!],
          ],
        ),
      ),
    );
  }
}

class ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const ErrorView({super.key, required this.message, this.onRetry});
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_rounded, size: 44, color: Color(0xFFC96442)),
            const SizedBox(height: 14),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFFC96442), fontSize: 14)),
            if (onRetry != null) ...[
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Thử lại'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

void showSnack(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..clearSnackBars()
    ..showSnackBar(SnackBar(
      content: Text(message),
      behavior: SnackBarBehavior.floating,
      backgroundColor: error ? const Color(0xFFC0392B) : const Color(0xFF2D6A4F),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      margin: const EdgeInsets.all(12),
    ));
}

/// Small status pill (matched / confirmed / pending ...).
class StatusChip extends StatelessWidget {
  final String status;
  const StatusChip(this.status, {super.key});
  @override
  Widget build(BuildContext context) {
    final map = {
      'pending': (const Color(0xFF8A6D1A), const Color(0xFFFBF1D2), 'Chờ ghép'),
      'processing': (const Color(0xFF8A6D1A), const Color(0xFFFBF1D2), 'Đang xử lý'),
      'no_match': (const Color(0xFFB23B2E), const Color(0xFFF7DDD8), 'Chưa ghép'),
      'matched': (const Color(0xFF1F6B45), const Color(0xFFD7EFE0), 'Đã ghép'),
      'confirmed': (const Color(0xFF1F5FA8), const Color(0xFFD6E6F7), 'Đã xác nhận'),
      'ongoing': (const Color(0xFF1F5FA8), const Color(0xFFD6E6F7), 'Đang đi'),
      'completed': (const Color(0xFF555555), const Color(0xFFEAEAEA), 'Hoàn thành'),
      'cancelled': (const Color(0xFFB23B2E), const Color(0xFFF1E2E0), 'Đã huỷ'),
      'expired': (const Color(0xFF555555), const Color(0xFFEAEAEA), 'Hết hạn'),
      'open': (const Color(0xFF1F6B45), const Color(0xFFD7EFE0), 'Đang mở'),
      'full': (const Color(0xFF8A6D1A), const Color(0xFFFBF1D2), 'Đã đầy'),
    };
    final entry = map[status] ?? (const Color(0xFF555555), const Color(0xFFEAEAEA), status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
      decoration: BoxDecoration(color: entry.$2, borderRadius: BorderRadius.circular(20)),
      child: Text(entry.$3,
          style: TextStyle(color: entry.$1, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}

/// A slim banner shown at the top of a screen when the realtime socket is
/// disconnected or reconnecting. Returns [SizedBox.shrink] when connected, so
/// it is safe to always include in a Column.
class ConnectionBanner extends StatefulWidget {
  final RealtimeService realtime;
  const ConnectionBanner({super.key, required this.realtime});

  @override
  State<ConnectionBanner> createState() => _ConnectionBannerState();
}

class _ConnectionBannerState extends State<ConnectionBanner> {
  RealtimeState _state = RealtimeState.disconnected;

  @override
  void initState() {
    super.initState();
    _state = widget.realtime.state;
    widget.realtime.onConnectionChange(_onChange);
  }

  void _onChange(RealtimeState s) {
    if (mounted) setState(() => _state = s);
  }

  @override
  Widget build(BuildContext context) {
    if (_state == RealtimeState.connected) return const SizedBox.shrink();
    final reconnecting = _state == RealtimeState.reconnecting || _state == RealtimeState.connecting;
    return Material(
      color: reconnecting ? const Color(0xFFFBF1D2) : const Color(0xFFF7DDD8),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(
          children: [
            Icon(
              reconnecting ? Icons.sync_rounded : Icons.wifi_off_rounded,
              size: 16,
              color: reconnecting ? const Color(0xFF8A6D1A) : const Color(0xFFB23B2E),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                reconnecting ? 'Đang kết nối lại…' : 'Mất kết nối thời gian thực',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: reconnecting ? const Color(0xFF8A6D1A) : const Color(0xFFB23B2E),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Formats an integer amount as Vietnamese đồng with thousands separators.
String formatMoney(int amount) {
  var str = amount.abs().toString();
  final parts = <String>[];
  while (str.length > 3) {
    parts.insert(0, str.substring(str.length - 3));
    str = str.substring(0, str.length - 3);
  }
  parts.insert(0, str);
  return '${amount < 0 ? '-' : ''}${parts.join('.')}\u{20AB}';
}
