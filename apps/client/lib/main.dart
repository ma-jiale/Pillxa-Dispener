import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'models/demo_model.dart';
import 'screens/dispensing_page.dart';
import 'screens/login_page.dart';
import 'screens/prescriptions_page.dart';
import 'screens/settings_page.dart';
import 'theme/app_theme.dart';
import 'widgets/profile_avatar.dart';
import 'widgets/pillxai_mark.dart';
import 'widgets/app_menu.dart';

void main() => runApp(const PillxaiApp());

class PillxaiApp extends StatefulWidget {
  const PillxaiApp({super.key, this.model, this.initiallySignedIn = false});
  final DemoModel? model;
  final bool initiallySignedIn;
  @override
  State<PillxaiApp> createState() => _PillxaiAppState();
}

class _PillxaiAppState extends State<PillxaiApp> {
  late final DemoModel model = widget.model ?? DemoModel();
  Color accent = const Color(0xff191919);
  int page = 1;
  late bool _signedIn = widget.initiallySignedIn;

  @override
  void dispose() {
    if (widget.model == null) model.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: 'Pillxai · 客户端界面预览',
    debugShowCheckedModeBanner: false,
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('zh', 'CN')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    theme: createTheme(accent: accent),
    home: LayoutBuilder(
      builder: (context, bounds) {
        if (!_signedIn) {
          return LoginPage(
            onDemoLogin: () => setState(() {
              _signedIn = true;
              page = 1;
            }),
          );
        }
        final narrow = bounds.maxWidth < 600;
        return Scaffold(
          body: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      _Sidebar(
                        selected: page,
                        compact: narrow,
                        onSignOut: () => _signOut(context),
                        onSelect: (value) => setState(() => page = value),
                      ),
                      Expanded(
                        child: Column(
                          children: [
                            Expanded(
                              child: IndexedStack(
                                index: page,
                                children: [
                                  PrescriptionsPage(
                                    model: model,
                                    onOpenDispensing: () =>
                                        setState(() => page = 1),
                                  ),
                                  DispensingPage(model: model),
                                  SettingsPage(
                                    model: model,
                                    accent: accent,
                                    onAccentChanged: (value) =>
                                        setState(() => accent = value),
                                  ),
                                ],
                              ),
                            ),
                            ListenableBuilder(
                              listenable: model,
                              builder: (context, _) {
                                if (page == 1 || !model.active) {
                                  return const SizedBox.shrink();
                                }
                                return InkWell(
                                  onTap: () => setState(() => page = 1),
                                  child: Container(
                                    width: double.infinity,
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 24,
                                      vertical: 10,
                                    ),
                                    decoration: const BoxDecoration(
                                      color: Colors.white,
                                      border: Border(
                                        top: BorderSide(
                                          color: Color(0xffdedede),
                                        ),
                                      ),
                                    ),
                                    child: Text(
                                      '${model.taskResidentName} · ${model.currentMedicine.name}  ${model.count} / ${model.currentMedicine.target}  · ${model.stageLabel}   ↗',
                                      style: const TextStyle(fontSize: 12),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    ),
  );

  void _signOut(BuildContext context) {
    if (model.active) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请先完成或结束当前摆药，再退出账户。')));
      return;
    }
    setState(() => _signedIn = false);
  }
}

class _Sidebar extends StatelessWidget {
  const _Sidebar({
    required this.selected,
    required this.onSelect,
    required this.compact,
    required this.onSignOut,
  });
  final int selected;
  final ValueChanged<int> onSelect;
  final bool compact;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) => Container(
    width: compact ? 76 : 232,
    decoration: const BoxDecoration(
      color: Colors.white,
      border: Border(right: BorderSide(color: Color(0xffe5e5e5))),
    ),
    child: Column(
      children: [
        Padding(
          padding: EdgeInsets.symmetric(
            vertical: compact ? 24 : 32,
            horizontal: compact ? 10 : 32,
          ),
          child: compact
              ? const Column(
                  children: [
                    PillxaiMark(size: 27),
                    SizedBox(height: 8),
                    Text(
                      'Pillxai',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                )
              : const Row(
                  children: [
                    PillxaiMark(size: 25),
                    SizedBox(width: 7),
                    Text(
                      'Pillxai',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -.8,
                      ),
                    ),
                  ],
                ),
        ),
        const SizedBox(height: 48),
        _item(1, Icons.medication_outlined, '摆药'),
        const SizedBox(height: 12),
        _item(0, Icons.article_outlined, '处方管理'),
        const Spacer(),
        _item(2, Icons.settings_outlined, '设置'),
        _accountMenu(),
      ],
    ),
  );

  Widget _accountMenu() => Padding(
    padding: EdgeInsets.fromLTRB(compact ? 8 : 16, 12, compact ? 8 : 16, 20),
    child: AppActionMenu(
      key: const ValueKey('account-menu'),
      tooltip: '演示护理员 · 账户菜单',
      header: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          ProfileAvatar(
            asset: 'assets/images/avatars/account.png',
            label: '当前账户头像',
            size: 32,
          ),
          SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '演示护理员',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
              SizedBox(height: 3),
              Text(
                '演示账户',
                style: TextStyle(fontSize: 11, color: Color(0xff858585)),
              ),
            ],
          ),
        ],
      ),
      actions: [AppMenuAction('退出当前用户', onSignOut, icon: Icons.logout_rounded)],
      child: Padding(
        padding: EdgeInsets.zero,
        child: Row(
          mainAxisAlignment: compact
              ? MainAxisAlignment.center
              : MainAxisAlignment.start,
          children: [
            const ProfileAvatar(
              asset: 'assets/images/avatars/account.png',
              label: '演示护理员头像',
            ),
            if (!compact) ...[
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '演示护理员',
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    SizedBox(height: 3),
                    Text(
                      '演示账户',
                      style: TextStyle(fontSize: 11, color: Color(0xff858585)),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.unfold_more_rounded,
                size: 17,
                color: Color(0xff858585),
              ),
            ],
          ],
        ),
      ),
    ),
  );

  Widget _item(int index, IconData icon, String label) {
    final active = selected == index;
    final color = active ? const Color(0xff242424) : const Color(0xff777777);
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: compact ? 7 : 12),
      child: Semantics(
        selected: active,
        child: Material(
          color: active ? const Color(0xffefeff1) : Colors.transparent,
          borderRadius: BorderRadius.circular(16),
          child: InkWell(
            key: ValueKey('nav-$index'),
            borderRadius: BorderRadius.circular(16),
            overlayColor: const WidgetStatePropertyAll(Color(0x08000000)),
            onTap: () => onSelect(index),
            child: Container(
              height: compact ? 72 : 56,
              width: double.infinity,
              padding: compact
                  ? EdgeInsets.zero
                  : const EdgeInsets.symmetric(horizontal: 20),
              child: Flex(
                direction: compact ? Axis.vertical : Axis.horizontal,
                mainAxisAlignment: compact
                    ? MainAxisAlignment.center
                    : MainAxisAlignment.start,
                children: [
                  if (index == 1)
                    CustomPaint(
                      size: const Size.square(22),
                      painter: const _CapsulePainter(Color(0xff242424)),
                    )
                  else
                    Icon(icon, size: 22, color: color),
                  SizedBox(height: compact ? 9 : 0, width: compact ? 0 : 14),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: compact ? 11 : 14,
                      color: color,
                      fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _CapsulePainter extends CustomPainter {
  const _CapsulePainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.7
      ..strokeCap = StrokeCap.round;
    final halfHeight = size.height * .23;
    canvas.translate(size.width / 2, size.height / 2);
    canvas.rotate(-math.pi / 4);
    final capsule = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset.zero,
        width: size.width * .94,
        height: halfHeight * 2,
      ),
      Radius.circular(halfHeight),
    );
    canvas.drawRRect(capsule, Paint()..color = Colors.white);
    canvas.save();
    canvas.clipRRect(capsule);
    // The left half becomes the lower half after the capsule is rotated.
    canvas.drawRect(
      Rect.fromLTRB(-size.width, -halfHeight, 0, halfHeight),
      Paint()..color = color,
    );
    canvas.restore();
    canvas.drawRRect(capsule, paint);
    canvas.drawLine(Offset(0, -halfHeight), Offset(0, halfHeight), paint);
  }

  @override
  bool shouldRepaint(_CapsulePainter oldDelegate) => oldDelegate.color != color;
}
