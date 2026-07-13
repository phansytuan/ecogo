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
  final List<Message> _messages = [];
  String? _myId;
  RealtimeService? _rt;
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
      setState(() => _messages.add(m));
    });
  }

  Future<void> _load(AppState app) async {
    try {
      final msgs = await app.chat.list(widget.bookingId);
      if (!mounted) return;
      setState(() => _messages..clear()..addAll(msgs));
    } catch (e) {
      if (mounted) showSnack(context, e is ApiException ? e.friendly : 'Không tải được tin nhắn', error: true);
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
      });
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
    _input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nhắn với khách')),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
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
                      decoration: const InputDecoration(
                        hintText: 'Nhập tin nhắn…',
                        border: OutlineInputBorder(),
                        isDense: true,
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  IconButton(icon: const Icon(Icons.send), onPressed: _send),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
