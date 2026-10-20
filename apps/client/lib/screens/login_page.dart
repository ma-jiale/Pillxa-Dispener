import 'package:flutter/material.dart';

import '../widgets/pillxai_mark.dart';

/// Local preview only. Real authentication belongs to the account service.
class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onDemoLogin});
  final VoidCallback onDemoLogin;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _account = TextEditingController();
  final _password = TextEditingController();
  bool _obscurePassword = true;
  String? _error;

  @override
  void dispose() {
    _account.dispose();
    _password.dispose();
    super.dispose();
  }

  void _login() {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;
    if (_account.text.trim() != 'demo' || _password.text != 'pillxai') {
      setState(() => _error = '演示账号或密码不正确，请使用下方的演示账号。');
      return;
    }
    FocusScope.of(context).unfocus();
    _password.clear();
    widget.onDemoLogin();
  }

  void _fillDemoAccount() {
    _formKey.currentState!.reset();
    _account.text = 'demo';
    _password.text = 'pillxai';
    setState(() => _error = null);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: const Color(0xfff7f7f6),
    body: SafeArea(
      child: LayoutBuilder(
        builder: (context, bounds) {
          final compact = bounds.maxWidth < 600;
          final padding = compact ? 24.0 : 40.0;
          return SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: bounds.maxHeight),
              child: Padding(
                padding: EdgeInsets.all(padding),
                child: Column(
                  children: [
                    const Row(
                      children: [
                        PillxaiMark(size: 24),
                        SizedBox(width: 8),
                        Text(
                          'Pillxa',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w600,
                            letterSpacing: -.8,
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: compact ? 44 : 64),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 432),
                      child: Container(
                        padding: EdgeInsets.all(compact ? 24 : 36),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(color: const Color(0xffe7e7e5)),
                        ),
                        child: Form(
                          key: _formKey,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const Text(
                                '欢迎回来',
                                style: TextStyle(
                                  fontSize: 26,
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: -.5,
                                ),
                              ),
                              const SizedBox(height: 8),
                              const Text(
                                '登录 Pillxa，开始今天的工作。',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Color(0xff777777),
                                ),
                              ),
                              const SizedBox(height: 32),
                              const Text('账号', style: TextStyle(fontSize: 13)),
                              const SizedBox(height: 8),
                              TextFormField(
                                key: const ValueKey('login-account'),
                                controller: _account,
                                textInputAction: TextInputAction.next,
                                autocorrect: false,
                                enableSuggestions: false,
                                decoration: const InputDecoration(
                                  hintText: '输入账号',
                                ),
                                validator: (value) =>
                                    value == null || value.trim().isEmpty
                                    ? '请输入账号'
                                    : null,
                              ),
                              const SizedBox(height: 20),
                              const Text('密码', style: TextStyle(fontSize: 13)),
                              const SizedBox(height: 8),
                              TextFormField(
                                key: const ValueKey('login-password'),
                                controller: _password,
                                obscureText: _obscurePassword,
                                autocorrect: false,
                                enableSuggestions: false,
                                textInputAction: TextInputAction.done,
                                onFieldSubmitted: (_) => _login(),
                                decoration: InputDecoration(
                                  hintText: '输入密码',
                                  suffixIcon: IconButton(
                                    tooltip: _obscurePassword ? '显示密码' : '隐藏密码',
                                    icon: Icon(
                                      _obscurePassword
                                          ? Icons.visibility_outlined
                                          : Icons.visibility_off_outlined,
                                      size: 20,
                                    ),
                                    onPressed: () => setState(
                                      () =>
                                          _obscurePassword = !_obscurePassword,
                                    ),
                                  ),
                                ),
                                validator: (value) =>
                                    value == null || value.isEmpty
                                    ? '请输入密码'
                                    : null,
                              ),
                              if (_error != null) ...[
                                const SizedBox(height: 12),
                                Semantics(
                                  liveRegion: true,
                                  child: Text(
                                    _error!,
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .error,
                                    ),
                                  ),
                                ),
                              ],
                              const SizedBox(height: 28),
                              FilledButton(
                                key: const ValueKey('login-submit'),
                                onPressed: _login,
                                child: const Text('登录'),
                              ),
                              const SizedBox(height: 16),
                              const Text(
                                '账号由机构管理员分配',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Color(0xff888888),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    const Text(
                      '界面预览 · 暂未接入登录服务',
                      style: TextStyle(fontSize: 11, color: Color(0xff888888)),
                    ),
                    TextButton(
                      key: const ValueKey('fill-demo-account'),
                      onPressed: _fillDemoAccount,
                      style: TextButton.styleFrom(
                        foregroundColor: const Color(0xff555555),
                      ),
                      child: const Text(
                        '填入演示账号',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    ),
  );
}
