import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/main.dart';
import 'package:pillxai_client/models/demo_model.dart';
import 'package:pillxai_client/widgets/profile_avatar.dart';

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
    testWidgets('实际主题七药确认、预览和跨页面视觉检查 $size', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final model = DemoModel(autoTick: false);
      addTearDown(model.dispose);
      const root = ValueKey('capture-root');
      await tester.pumpWidget(
        RepaintBoundary(
          key: root,
          child: PillxaiApp(model: model, initiallySignedIn: true),
        ),
      );
      await tester.pumpAndSettle();
      await tester.runAsync(() async {
        for (final resident in model.residents) {
          if (resident.avatarAsset != null) {
            await precacheImage(
              AssetImage(resident.avatarAsset!),
              tester.element(find.byType(PillxaiApp)),
            );
          }
        }
      });
      await tester.pumpAndSettle();
      Future<void> capture(String stage) async {
        const phase = String.fromEnvironment('UI_CAPTURE');
        if (phase.isEmpty) return;
        await tester.runAsync(() async {
          final boundary = tester.renderObject<RenderRepaintBoundary>(
            find.byKey(root),
          );
          final image = await boundary.toImage(pixelRatio: 1);
          final data = await image.toByteData(format: ui.ImageByteFormat.png);
          final folder = Directory('../../.tools/ui-review')
            ..createSync(recursive: true);
          File('${folder.path}/$phase-${size.width.toInt()}-$stage.png')
              .writeAsBytesSync(data!.buffer.asUint8List());
          image.dispose();
        });
      }

      await capture('queue');
      final titleOrigin = tester.getTopLeft(
        find.byKey(const ValueKey('page-title-dispensing')),
      );
      await tester.tap(find.byKey(const ValueKey('prepare-r1')));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pumpAndSettle();
      expect(
        tester
            .widgetList<ResidentIdentity>(find.byType(ResidentIdentity))
            .where((i) => i.name == model.residents.first.name)
            .every((i) => i.asset == model.residents.first.avatarAsset),
        isTrue,
      );
      await capture('confirm');
      final start = find.byKey(const ValueKey('confirm-dispense'));
      final previewButton = find.byKey(const ValueKey('pattern-open'));
      final header = find.text('早').first;
      expect(
        tester.getRect(header).top - tester.getRect(previewButton).bottom,
        greaterThanOrEqualTo(18),
      );
      final medicineList = find.byKey(const ValueKey('confirmation-medicines'));
      final buttonBefore = tester.getRect(start);
      await tester.drag(medicineList, const Offset(0, -450));
      await tester.pumpAndSettle();
      expect(
        find.text(model.residents.first.medicines.last.name),
        findsOneWidget,
      );
      expect(tester.getRect(start), buttonBefore);
      await capture('confirm-scrolled');
      expect(tester.getRect(start).bottom, lessThanOrEqualTo(size.height));
      expect(tester.takeException(), isNull);
      await tester.tap(find.byKey(const ValueKey('pattern-open')));
      await tester.pumpAndSettle();
      await capture('pattern');
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('关闭').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('取消').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('nav-0')));
      await tester.pumpAndSettle();
      await capture('prescriptions');
      expect(
        tester.getTopLeft(
          find.byKey(const ValueKey('page-title-prescriptions')),
        ),
        titleOrigin,
      );
      await tester.tap(find.byKey(const ValueKey('nav-2')));
      await tester.pumpAndSettle();
      await capture('settings');
      expect(
        tester.getTopLeft(find.byKey(const ValueKey('page-title-settings'))),
        titleOrigin,
      );
      model.verifyBox();
      model.start();
      await tester.tap(find.byKey(const ValueKey('nav-1')));
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.byKey(const ValueKey('page-title-dispensing'))),
        titleOrigin,
      );
      await capture('execution');
      expect(tester.takeException(), isNull);
    });
  }
}
