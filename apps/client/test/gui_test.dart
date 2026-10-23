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
    model.boxFeedback.value = BoxFeedback.match;
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

  testWidgets('完成后以动画切换并自动开始下一药，暂停可用且最后一药正常收尾', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    model.prepareTask(
      Resident(
        id: 'automatic-next',
        name: '测试长者',
        bed: '101 床',
        medicines: [
          for (final name in ['第一种药', '第二种药', '第三种药'])
            Medicine(id: name, name: name, strength: '5 mg', target: 1),
        ],
      ),
    );
    model.verifyBox();
    model.start();
    await tester.pumpWidget(PillxaiApp(model: model, initiallySignedIn: true));
    await tester.pumpAndSettle();
    expect(find.text('第一种药'), findsOneWidget);
    final previousBounds = tester.getRect(
      find.byKey(const ValueKey('medicine-current-slot')),
    );
    final previewBounds = tester.getRect(
      find.byKey(const ValueKey('medicine-next-slot')),
    );

    model.advance();
    await tester.pump();
    final promotion = find.byKey(const ValueKey('medicine-promotion'));
    expect(tester.getRect(promotion), previewBounds);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 160));
    final movingBounds = tester.getRect(promotion);
    expect(movingBounds.left, lessThan(previewBounds.left));
    expect(movingBounds.left, greaterThan(previousBounds.left));
    expect(movingBounds.width, greaterThan(previewBounds.width));
    expect(
      tester.getRect(find.byKey(const ValueKey('medicine-departure'))).left,
      lessThan(previousBounds.left),
    );
    await tester.pumpAndSettle();
    expect(promotion, findsNothing);
    expect(find.text('第一种药'), findsNothing);
    expect(find.text('第二种药'), findsOneWidget);
    expect(find.text('第三种药'), findsOneWidget);
    expect(find.text('开始本药'), findsNothing);
    expect(find.text('暂停'), findsOneWidget);
    expect(model.stage, DispenseStage.running);
    expect(model.count, 0);

    await tester.tap(find.byKey(const ValueKey('dispense-primary')));
    await tester.pumpAndSettle();
    expect(model.stage, DispenseStage.paused);
    model.advance();
    expect(model.count, 0);
    expect(model.currentMedicine.name, '第二种药');
    await tester.tap(find.byKey(const ValueKey('dispense-primary')));
    await tester.pumpAndSettle();
    expect(find.text('暂停'), findsOneWidget);
    model.advance();
    await tester.pumpAndSettle();
    expect(find.text('第二种药'), findsNothing);
    expect(find.text('第三种药'), findsOneWidget);
    expect(find.text('下一药'), findsNothing);
    expect(find.text('暂停'), findsOneWidget);
    expect(model.stage, DispenseStage.running);
    model.advance();
    await tester.pumpAndSettle();
    expect(model.stage, DispenseStage.completed);
    expect(find.byKey(const ValueKey('prepare-r1')), findsOneWidget);
    expect(find.text('开始本药'), findsNothing);
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
      for (final category in ['appearance', 'about']) {
        final wideNav = find.byKey(ValueKey('settings-$category'));
        if (wideNav.evaluate().isNotEmpty) {
          await tester.tap(wideNav);
        } else {
          final label = {'appearance': '外观', 'about': '关于'}[category]!;
          final current = find
              .text(category == 'appearance' ? '通用' : '外观')
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
    await tester.enterText(
      find.byKey(const ValueKey('login-account')),
      'admin',
    );
    await tester.enterText(
      find.byKey(const ValueKey('login-password')),
      'admin123',
    );
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
      expect(
        find.byKey(const ValueKey('page-title-prescriptions')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
