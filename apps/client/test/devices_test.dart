import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/main.dart';
import 'package:pillxai_client/models/demo_model.dart';

void main() {
  setUpAll(() async {
    await (FontLoader('NotoSansSC')
          ..addFont(rootBundle.load('assets/fonts/NotoSansCJKsc-Regular.otf')))
        .load();
    await (FontLoader('MaterialIcons')..addFont(
          File(
            '../../.tools/flutter/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf',
          ).readAsBytes().then((b) => ByteData.sublistView(b)),
        ))
        .load();
  });

  for (final size in [
    const Size(1280, 800),
    const Size(1024, 600),
    const Size(390, 844),
  ]) {
    testWidgets('设备搜索、添加、连接、切页保持与移除 $size', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final model = DemoModel(autoTick: false);
      addTearDown(model.dispose);
      const root = ValueKey('device-capture');
      await tester.pumpWidget(
        RepaintBoundary(
          key: root,
          child: PillxaiApp(model: model, initiallySignedIn: true),
        ),
      );
      await tester.pumpAndSettle();

      Future<void> capture(String stage) async {
        if (const String.fromEnvironment('UI_CAPTURE').isEmpty) return;
        await tester.runAsync(() async {
          final boundary = tester.renderObject<RenderRepaintBoundary>(
            find.byKey(root),
          );
          final image = await boundary.toImage(pixelRatio: 1);
          final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
          final folder = Directory('../../.tools/ui-review')
            ..createSync(recursive: true);
          File('${folder.path}/devices-${size.width.toInt()}-$stage.png')
              .writeAsBytesSync(bytes!.buffer.asUint8List());
          image.dispose();
        });
      }

      Future<void> tapKey(String key) async {
        final finder = find.byKey(ValueKey(key));
        await tester.ensureVisible(finder);
        await tester.tap(finder);
        await tester.pumpAndSettle();
      }

      final status = find.byKey(const ValueKey('device-status'));
      expect(
        find.descendant(of: status, matching: find.text('未连接')),
        findsOneWidget,
      );
      await capture('home');
      await tapKey('device-status');
      expect(find.text('我的设备'), findsOneWidget);
      await capture('empty');
      await tester.ensureVisible(find.byKey(const ValueKey('add-device')));
      await tester.tap(find.byKey(const ValueKey('add-device')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('正在查找可用设备…'), findsOneWidget);
      await capture('searching');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await capture('results');
      await tapKey('add-PillDispenser01');
      await capture('added');
      await tapKey('connect-PillDispenser01');
      expect(
        find.descendant(of: status, matching: find.text('已连接')),
        findsOneWidget,
      );
      await capture('connected');
      expect(model.boxFeedback.value, BoxFeedback.disconnected);
      await tester.tap(find.byTooltip('关闭我的设备'));
      await tester.pumpAndSettle();
      await tapKey('nav-0');
      expect(status.hitTestable(), findsNothing);
      await tapKey('nav-2');
      expect(status.hitTestable(), findsNothing);
      await tapKey('nav-1');
      expect(
        find.descendant(of: status, matching: find.text('已连接')),
        findsOneWidget,
      );
      await tapKey('device-status');
      await tapKey('disconnect-PillDispenser01');
      expect(
        find.descendant(of: status, matching: find.text('未连接')),
        findsOneWidget,
      );

      await tester.ensureVisible(find.byKey(const ValueKey('add-device')));
      await tester.tap(find.byKey(const ValueKey('add-device')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TextButton>(
              find.byKey(const ValueKey('add-PillDispenser01')),
            )
            .onPressed,
        isNull,
      );
      await tester.ensureVisible(find.byKey(const ValueKey('rescan-devices')));
      await tester.tap(find.byKey(const ValueKey('rescan-devices')));
      await tester.pump();
      expect(find.text('正在查找可用设备…'), findsOneWidget);
      await tester.tap(find.byTooltip('返回我的设备'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 2));
      expect(find.text('选择要添加的摆药机'), findsNothing);

      await tapKey('remove-PillDispenser01');
      await tester.tap(find.text('取消'));
      await tester.pumpAndSettle();
      expect(find.text('PillDispenser01'), findsOneWidget);
      await tapKey('remove-PillDispenser01');
      await tester.tap(find.text('移除'));
      await tester.pumpAndSettle();
      expect(find.text('PillDispenser01'), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('右上角进入设备页；单连接、任务保护与准备门槛', (tester) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    await tester.pumpWidget(PillxaiApp(model: model, initiallySignedIn: true));
    Future<void> tap(String key) async {
      await tester.ensureVisible(find.byKey(ValueKey(key)));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(ValueKey(key)));
      await tester.pumpAndSettle();
    }

    await tap('nav-2');
    expect(find.text('本机设备'), findsNothing);
    expect(
      find.byKey(const ValueKey('device-status')).hitTestable(),
      findsNothing,
    );
    await tap('nav-1');
    await tap('device-status');
    for (final name in ['PillDispenser01', 'USB 串口设备']) {
      await tap('add-device');
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      await tap('add-$name');
      await tap('connect-$name');
    }
    expect(
      find.byKey(const ValueKey('connect-PillDispenser01')),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('disconnect-USB 串口设备')), findsOneWidget);
    await tester.tap(find.byTooltip('关闭我的设备'));
    await tester.pumpAndSettle();
    await tap('nav-1');
    await tap('prepare-r1');
    expect(
      tester
          .widget<FilledButton>(find.byKey(const ValueKey('confirm-dispense')))
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('取消'));
    await tester.pumpAndSettle();
    model.verifyBox();
    model.start();
    model.advance();
    await tap('device-status');
    await tap('disconnect-USB 串口设备');
    expect(find.text('请先完成或结束当前摆药，再更改设备连接。'), findsOneWidget);
    expect(find.byKey(const ValueKey('disconnect-USB 串口设备')), findsOneWidget);
    await tap('connect-PillDispenser01');
    await tap('remove-USB 串口设备');
    expect(find.text('移除设备？'), findsNothing);
    expect(model.stage, DispenseStage.running);
    expect(model.count, 1);
    expect(tester.takeException(), isNull);
  });
}
