import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:ecogo_core/ecogo_core.dart';
import '../state/app_state.dart';

class ChatScreen extends StatefulWidget {
  final String bookingId;
  const ChatScreen({super.key, required this.bookingId});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<Message> _messages = [];
  late final AppState _app;
  String? _myId;
  bool _loading = true;
  String? _error;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    // Capture the AppState now; reading context in dispose() is unsafe.
    _app = context.read<AppState>();
    _myId = _app.userId;
    _load();
    _app.realtime.joinChat(widget.bookingId);
    _app.realtime.onChatMessage((d) {
      if (!mounted) return;
      final m = Message.fromJson(d);
      // The socket echoes our own sends too, and may overlap loaded history —
      // dedupe by id so a message never appears twice.
      if (_messages.any((e) => e.id == m.id)) return;
      setState(() => _messages.add(m));
      _scrollToBottom();
    });
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final msgs = await _app.chat.list(widget.bookingId);
      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(msgs);
        _loading = false;
      });
      _scrollToBottom();
    } on ApiException catch (e) {
      if (mounted) setState(() { _error = e.friendly; _loading = false; });
    } catch (_) {
      if (mounted) setState(() { _error = 'Không tải được tin nhắn'; _loading = false; });
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _app.chat.send(widget.bookingId, text);
      _input.clear();
      // The socket echo appends it; no optimistic insert to avoid duplicates.
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Gửi tin nhắn thất bại', error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  @override
  void dispose() {
    _app.realtime.off('chat:message');
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nhắn với tài xế')),
      body: Column(
        children: [
          Expanded(child: _body()),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      decoration: const InputDecoration(
                        hintText: 'Nhập tin nhắn…',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  IconButton(
                    icon: _sending
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.send),
                    onPressed: _sending ? null : _send,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _body() {
    if (_loading) return const LoadingView(label: 'Đang tải tin nhắn…');
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_messages.isEmpty) {
      return const EmptyState(
        icon: Icons.chat_bubble_outline,
        message: 'Chưa có tin nhắn. Hãy bắt đầu cuộc trò chuyện.',
      );
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(12),
      itemCount: _messages.length,
      itemBuilder: (_, i) {
        final m = _messages[i];
        final mine = m.senderId == _myId;
        return Align(
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 4),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: mine ? Theme.of(context).colorScheme.primaryContainer : Colors.grey.shade200,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(m.body),
          ),
        );
      },
    );
  }
}
