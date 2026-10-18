import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/main.dart';
import 'package:pillxai_client/models/demo_model.dart';

// Run with: scripts/flutter.cmd test tool/capture_preview.dart
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Render the current tablet preview', (tester) async {
    debugDisableShadows = false;
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    for (final font in {
      'NotoSansSC': 'assets/fonts/NotoSansCJKsc-Regular.otf',
      'MaterialIcons': 'fonts/MaterialIcons-Regular.otf',
    }.entries) {
      await (FontLoader(font.key)..addFont(rootBundle.load(font.value))).load();
    }

    final boundaryKey = GlobalKey();
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    await tester.pumpWidget(
      RepaintBoundary(
        key: boundaryKey,
        child: PillxaiApp(model: model),
      ),
    );
    final context = tester.element(find.byType(PillxaiApp));
    await tester.runAsync(() async {
      for (final asset in [
        'assets/images/medicine-a.png',
        'assets/images/medicine-b.png',
        for (final name in ['account', 'wang', 'zhang', 'li', 'chen'])
          'assets/images/avatars/$name.png',
      ]) {
        await precacheImage(AssetImage(asset), context);
      }
    });

    Future<void> capture(String filename) async {
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      await tester.runAsync(() async {
        final boundary =
            boundaryKey.currentContext!.findRenderObject()
                as RenderRepaintBoundary;
        final image = await boundary.toImage();
        final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
        await File('preview/$filename')
            .writeAsBytes(bytes!.buffer.asUint8List());
        image.dispose();
      });
    }

    await capture('login.png');
    await tester.tap(find.byKey(const ValueKey('fill-demo-account')));
    await tester.tap(find.byKey(const ValueKey('login-submit')));
    await capture('A.png');
    await tester.tap(find.byKey(const ValueKey('nav-0')));
    await capture('prescriptions.png');
    await tester.tap(find.byKey(const ValueKey('nav-2')));
    await capture('settings.png');
    await tester.tap(find.byKey(const ValueKey('preparation-days')));
    await capture('settings-options.png');
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('account-menu')));
    await capture('account-menu.png');
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.tap(find.byKey(const ValueKey('nav-1')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('adjust-opening')));
    await capture('opening-dialog.png');
    debugDisableShadows = true;
  });
}
