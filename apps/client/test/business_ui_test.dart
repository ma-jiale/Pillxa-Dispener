import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/main.dart';
import 'package:pillxai_client/models/demo_model.dart';
import 'package:pillxai_client/models/preparation_plan.dart';
import 'package:pillxai_client/screens/preparation_page.dart';
import 'package:pillxai_client/theme/app_theme.dart';

void main() {
  testWidgets('图案关闭使用点缀色，移除圆点后日期原坐标不变', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    final plan = PreparationPlan(
      model.residents.first,
      DateTime(2026, 10, 23),
      7,
      bedtime: false,
    );
    const accent = Color(0xff2867bd);
    await tester.pumpWidget(
      MaterialApp(
        theme: createTheme(accent: accent),
        home: Scaffold(body: PatternDialog(plan: plan)),
      ),
    );
    await tester.pumpAndSettle();
    final metadata = find.descendant(
      of: find.byKey(const ValueKey('pattern-metadata')),
      matching: find.byType(RichText),
    );
    final rich = tester.widget<RichText>(metadata);
    expect(rich.text.toPlainText(), isNot(contains('·')));
    final paragraph = tester.renderObject<RenderParagraph>(metadata);
    final start =
        plan.resident.name.length + 1; // WidgetSpan is one placeholder.
    final newDate = paragraph
        .getBoxesForSelection(
          TextSelection(baseOffset: start, extentOffset: start + 1),
        )
        .first
        .left;
    final old = TextPainter(
      text: TextSpan(
        text: '${plan.resident.name} · ${plan.dates}',
        style: rich.text.style,
      ),
      textDirection:
          rich.textDirection ?? Directionality.of(tester.element(metadata)),
      textScaler: rich.textScaler,
    )..layout();
    final oldStart = plan.resident.name.length + 3;
    final oldDate = old
        .getBoxesForSelection(
          TextSelection(baseOffset: oldStart, extentOffset: oldStart + 1),
        )
        .first
        .left;
    expect(newDate, closeTo(oldDate, .01));
    old.dispose();
    final close = find.byKey(const ValueKey('pattern-close'));
    expect(
      tester
          .widget<Material>(
            find.descendant(of: close, matching: find.byType(Material)).first,
          )
          .color,
      accent,
    );
    expect(find.text('计划 · 1 点 = 1 颗'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('设置移除整组图片显示和演示入口，搜索也不返回占位项', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    await tester.pumpWidget(PillxaiApp(model: model, initiallySignedIn: true));
    await tester.tap(find.byKey(const ValueKey('nav-2')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('settings-appearance')));
    await tester.pumpAndSettle();
    expect(find.text('图片显示'), findsNothing);
    expect(find.text('药品图片'), findsNothing);
    await tester.enterText(find.byKey(const ValueKey('settings-search')), '图片');
    await tester.pumpAndSettle();
    expect(find.text('没有找到相关设置，请换个关键词。'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('settings-about')));
    await tester.pumpAndSettle();
    expect(find.text('重置摆药演示'), findsNothing);
    expect(find.text('演示与关于'), findsNothing);
    expect(find.text('本机设备'), findsNothing);
    final autoUpdate = find.byKey(const ValueKey('auto-update'));
    expect(tester.widget<Switch>(autoUpdate).value, isTrue);
    await tester.ensureVisible(autoUpdate);
    await tester.tap(autoUpdate);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-0')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-2')));
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(autoUpdate).value, isFalse);
    final check = find.byKey(const ValueKey('check-for-updates'));
    await tester.ensureVisible(check);
    await tester.tap(check);
    await tester.pumpAndSettle();
    expect(find.textContaining('更新服务尚未接入'), findsOneWidget);
    await tester.tap(find.text('知道了'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('settings-search')), '设备');
    await tester.pumpAndSettle();
    expect(find.text('没有找到相关设置，请换个关键词。'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
