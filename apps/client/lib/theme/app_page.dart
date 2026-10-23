import 'package:flutter/material.dart';

/// Main-page origins are shared even when their content layouts differ.
abstract final class AppPage {
  static const navigationBackground = Color(0xfff6f6f6);
  static EdgeInsets insets(BuildContext context) =>
      MediaQuery.sizeOf(context).width < 900
      ? const EdgeInsets.fromLTRB(20, 20, 20, 28)
      : const EdgeInsets.fromLTRB(32, 24, 32, 28);
}

class PageTitle extends StatelessWidget {
  const PageTitle(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: Theme.of(context).textTheme.headlineMedium);
}
