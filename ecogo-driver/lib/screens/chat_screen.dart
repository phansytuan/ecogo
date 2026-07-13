import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
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
  String? _myId;
  RealtimeService? _rt;
  bool _loading = true;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    final app = context.read<AppState>();
    _myId = app.userId;
    _rt = app.realtime;
    _load(app);
    app.realtime.joinChat(widget.bookingId);
    app.realtime.onChatMessage((d) {
      if (!mounted) return;
      final m = Message.fromJson(d);
      if (_messages.any((x) => x.id == m.id)) return;
      setState(() {
        _messages.add(m);
        _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      });
      _scrollToBottom();
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _load(AppState app) async {
    try {
      final msgs = await app.chat.list(widget.bookingId);
      if (!mounted) return;
      setState(() {
        _messages
          ..clear()
          ..addAll(msgs)
          ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
        _loading = false;
      });
      _scrollToBottom();
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      showSnack(context, e is ApiException ? e.friendly : 'Không tải được tin nhắn', error: true);
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      final m = await context.read<AppState>().chat.send(widget.bookingId, text);
      if (!mounted) return;
      _input.clear();
      setState(() {
        if (!_messages.any((x) => x.id == m.id)) _messages.add(m);
        _messages.sort((a, b) => a.createdAt.compareTo(b.createdAt));
      });
      _scrollToBottom();
    } on ApiException catch (e) {
      if (mounted) showSnack(context, e.friendly, error: true);
    } catch (_) {
      if (mounted) showSnack(context, 'Gửi tin nhắn thất bại', error: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  void dispose() {
    _rt?.off('chat:message');
    _rt?.leaveChat(widget.bookingId);
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('HH:mm');
    return Scaffold(
      appBar: AppBar(title: const Text('Nhắn với khách')),
      body: Column(
        children: [
          if (_rt != null) ConnectionBanner(realtime: _rt!),
          Expanded(
            child: _loading
                ? const LoadingView(label: 'Đang tải tin nhắn…')
                : _messages.isEmpty
                    ? const EmptyState(
                        icon: Icons.chat_bubble_outline,
                        message: 'Chưa có tin nhắn nào.\nHãy gửi tin nhắn đầu tiên!',
                      )
                    : ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.all(12),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) {
                          final m = _messages[i];
                          final mine = m.senderId == _myId;
                          final showTime = i == 0 ||
                              m.createdAt.difference(_messages[i - 1].createdAt).inMinutes > 5;
                          return Column(
                            children: [
                              if (showTime)
                                Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                  child: Text(fmt.format(m.createdAt.toLocal()),
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: Colors.black.withValues(alpha: 0.4))),
                                ),
                              Align(
                                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                                child: ConstrainedBox(
                                  constraints: BoxConstraints(
                                    maxWidth: MediaQuery.of(context).size.width * 0.75,
                                  ),
                                  child: Container(
                                    margin: const EdgeInsets.symmetric(vertical: 3),
                                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                                    decoration: BoxDecoration(
                                      color: mine
                                          ? Theme.of(context).colorScheme.primaryContainer
                                          : Colors.grey.shade200,
                                      borderRadius: BorderRadius.only(
                                        topLeft: const Radius.circular(14),
                                        topRight: const Radius.circular(14),
                                        bottomLeft: mine ? const Radius.circular(14) : Radius.zero,
                                        bottomRight: mine ? Radius.zero : const Radius.circular(14),
                                      ),
                                    ),
                                    child: Column(
                                      crossAxisAlignment: mine
                                          ? CrossAxisAlignment.end
                                          : CrossAxisAlignment.start,
                                      children: [
                                        Text(m.body),
                                        const SizedBox(height: 3),
                                        Text(fmt.format(m.createdAt.toLocal()),
                                            style: TextStyle(
                                                fontSize: 10,
                                                color: Colors.black.withValues(alpha: 0.4))),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _input,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        hintText: 'Nhập tin nhắn…',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 4),
                  IconButton.filled(
                    icon: _sending
                        ? const SizedBox(
                            width: 18, height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
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
}
