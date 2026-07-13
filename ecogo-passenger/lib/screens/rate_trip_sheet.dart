import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';

/// Bottom sheet for rating a completed trip's driver. Returns the submitted
/// score (1–5) on success, or null if dismissed.
class RateTripSheet extends StatefulWidget {
  final String bookingId;
  final String? driverName;

  const RateTripSheet({super.key, required this.bookingId, this.driverName});

  static Future<int?> show(BuildContext context,
      {required String bookingId, String? driverName}) {
    return showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => RateTripSheet(bookingId: bookingId, driverName: driverName),
    );
  }

  @override
  State<RateTripSheet> createState() => _RateTripSheetState();
}

class _RateTripSheetState extends State<RateTripSheet> {
  int _score = 0;
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_score == 0) {
      showSnack(context, 'Hãy chọn số sao', error: true);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AppState>().ratings.rate(
            widget.bookingId,
            _score,
            comment: _comment.text,
          );
      if (!mounted) return;
      showSnack(context, 'Cảm ơn bạn đã đánh giá!');
      Navigator.pop(context, _score);
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Gửi đánh giá thất bại', error: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + bottomInset),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            widget.driverName != null ? 'Đánh giá ${widget.driverName}' : 'Đánh giá tài xế',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          Text('Trải nghiệm chuyến đi của bạn thế nào?',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black.withOpacity(0.55), fontSize: 13)),
          const SizedBox(height: 18),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final filled = i < _score;
              return IconButton(
                iconSize: 40,
                tooltip: '${i + 1} sao',
                onPressed: _busy ? null : () => setState(() => _score = i + 1),
                icon: Icon(
                  filled ? Icons.star_rounded : Icons.star_outline_rounded,
                  color: filled ? const Color(0xFFF2B01E) : Colors.black26,
                ),
              );
            }),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _comment,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Nhận xét (không bắt buộc)',
              alignLabelWithHint: true,
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Text('Gửi đánh giá'),
          ),
        ],
      ),
    );
  }
}
