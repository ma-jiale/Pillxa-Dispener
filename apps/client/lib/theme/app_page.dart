import 'package:flutter/material.dart';

/// Main-page origins are shared even when their content layouts differ.
abstract final class AppPage {
  static EdgeInsets insets(BuildContext context) =>
      MediaQuery.sizeOf(context).width < 900
      ? const EdgeInsets.fromLTRB(20, 28, 20, 28)
      : const EdgeInsets.fromLTRB(32, 40, 32, 28);
}

class PageTitle extends StatelessWidget {
  const PageTitle(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) =>
      Text(text, style: Theme.of(context).textTheme.headlineMedium);
}
