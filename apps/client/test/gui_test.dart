import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/main.dart';
import 'package:pillxai_client/models/demo_model.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async {
    final font = FontLoader('NotoSansSC')
      ..addFont(rootBundle.load('assets/fonts/NotoSansCJKsc-Regular.otf'));
    await font.load();
  });

  testWidgets('识别、开始、跨页操作不改变当前任务，暂停可达', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    await tester.pumpWidget(PillxaiApp(model: model, initiallySignedIn: true));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('prepare-r1')));
    await tester.pumpAndSettle();
    await tester.pump(const Duration(milliseconds: 500));
    await tester.tap(find.byKey(const ValueKey('box-feedback')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('模拟反馈：本人药盒').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('confirm-dispense')));
    model.advance();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('nav-0')));
    await tester.pumpAndSettle();
    expect(find.text('王奶奶'), findsWidgets);
    expect(model.count, 1);
    await tester.tap(find.byKey(const ValueKey('nav-2')));
    await tester.pumpAndSettle();
    expect(model.stage, DispenseStage.running);
    await tester.tap(find.byKey(const ValueKey('nav-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('dispense-primary')));
    await tester.pumpAndSettle();
    expect(model.stage, DispenseStage.paused);
    expect(model.count, 1);
    expect(tester.takeException(), isNull);
  });

  for (final size in [
    const Size(1280, 800),
    const Size(1024, 600),
    const Size(390, 844),
  ]) {
    testWidgets('三个页面在 $size 下无布局溢出', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final model = DemoModel(autoTick: false);
      addTearDown(model.dispose);
      await tester.pumpWidget(
        PillxaiApp(model: model, initiallySignedIn: true),
      );
      await tester.pumpAndSettle();
      for (final page in [0, 1, 2]) {
        await tester.tap(find.byKey(ValueKey('nav-$page')));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: '$size, page $page');
      }
      for (final category in ['appearance', 'device', 'about']) {
        final wideNav = find.byKey(ValueKey('settings-$category'));
        if (wideNav.evaluate().isNotEmpty) {
          await tester.tap(wideNav);
        } else {
          final label = {
            'appearance': '外观',
            'device': '本机设备',
            'about': '演示与关于',
          }[category]!;
          final current = find
              .text(
                category == 'appearance'
                    ? '通用'
                    : category == 'device'
                    ? '外观'
                    : '本机设备',
              )
              .first;
          await tester.ensureVisible(current);
          await tester.tap(current);
          await tester.pumpAndSettle();
          await tester.tap(find.text(label).last);
        }
        await tester.pumpAndSettle();
        expect(
          tester.takeException(),
          isNull,
          reason: '$size, settings $category',
        );
      }
      expect(find.text('界面方案'), findsNothing);
    });
  }

  testWidgets('默认进入摆药，账户菜单可退出且不允许中断活跃任务', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    await tester.pumpWidget(PillxaiApp(model: model, initiallySignedIn: true));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('prepare-r1')), findsOneWidget);
    expect(
      tester.getTopLeft(find.byKey(const ValueKey('nav-1'))).dy,
      lessThan(tester.getTopLeft(find.byKey(const ValueKey('nav-0'))).dy),
    );
    await tester.tap(find.byKey(const ValueKey('account-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('退出当前用户'));
    await tester.pumpAndSettle();
    expect(find.text('欢迎回来'), findsOneWidget);
    expect(find.byKey(const ValueKey('nav-0')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('fill-demo-account')));
    await tester.tap(find.byKey(const ValueKey('login-submit')));
    await tester.pumpAndSettle();
    model.verifyBox();
    model.start();
    model.advance();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('account-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('退出当前用户'));
    await tester.pumpAndSettle();
    expect(find.text('请先完成或结束当前摆药，再退出账户。'), findsOneWidget);
    expect(model.stage, DispenseStage.running);
    expect(model.count, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('设置搜索跨分类筛选并即时保存，切换分类保留颜色输入', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    await tester.pumpWidget(PillxaiApp(model: model, initiallySignedIn: true));
    await tester.tap(find.byKey(const ValueKey('nav-2')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('settings-search')), '睡前');
    await tester.pumpAndSettle();
    expect(find.text('准备天数'), findsNothing);
    expect(find.byType(Switch), findsOneWidget);
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(model.bedtime, isTrue);
    await tester.enterText(
      find.byKey(const ValueKey('settings-search')),
      '不存在的设置',
    );
    await tester.pumpAndSettle();
    expect(find.text('没有找到相关设置，请换个关键词。'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('settings-appearance')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('custom-accent-input')),
      '#123456',
    );
    await tester.tap(find.byKey(const ValueKey('settings-general')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('settings-appearance')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TextField>(find.byKey(const ValueKey('custom-accent-input')))
          .controller!
          .text,
      '#123456',
    );
    expect(model.bedtime, isTrue);
    expect(tester.takeException(), isNull);
  });

  for (final size in [
    const Size(1280, 800),
    const Size(1024, 600),
    const Size(390, 844),
  ]) {
    testWidgets('浮层在 $size 下可选择、Escape 关闭及切页关闭', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final model = DemoModel(autoTick: false);
      addTearDown(model.dispose);
      await tester.pumpWidget(
        PillxaiApp(model: model, initiallySignedIn: true),
      );
      await tester.tap(find.byKey(const ValueKey('nav-2')));
      await tester.pumpAndSettle();
      final days = find.byKey(const ValueKey('preparation-days'));
      await tester.ensureVisible(days);
      await tester.tap(days);
      await tester.pumpAndSettle();
      expect(find.text('3 天'), findsOneWidget);
      await tester.sendKeyEvent(LogicalKeyboardKey.escape);
      await tester.pumpAndSettle();
      expect(find.text('3 天'), findsNothing);
      await tester.tap(days);
      await tester.pumpAndSettle();
      await tester.tap(find.text('3 天'));
      await tester.pumpAndSettle();
      expect(model.preparationDays, 3);
      expect(find.text('4 天'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('account-menu')));
      await tester.pumpAndSettle();
      expect(find.text('退出当前用户'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('nav-0')));
      await tester.pumpAndSettle();
      expect(find.text('退出当前用户'), findsNothing);
      expect(find.text('长者资料与用药安排'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
