import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/models/demo_model.dart';
import 'package:pillxai_client/models/preparation_plan.dart';
import 'package:pillxai_client/screens/preparation_page.dart';

void main() {
  test('计划按所选天数及有效日期计算，半片换算为颗粒', () {
    final start = DateTime(2026, 10, 23);
    final r = Resident(
      id: 'r',
      name: '测试',
      bed: '',
      medicines: [
        Medicine(
          id: 'm',
          name: '半片',
          strength: '5mg',
          form: '预切半片',
          doses: const DoseSchedule(morning: .5, noon: 0, evening: 0),
          endDate: DateTime(2026, 10, 24),
        ),
      ],
    );
    final plan = PreparationPlan(r, start, 7, bedtime: false);
    expect(plan.medicines.single.target, 2);
    expect(PreparationPlan.particles(plan.medicines.single, 0, start), 1);
  });
  for (final size in [
    const Size(1280, 800),
    const Size(1024, 600),
    const Size(390, 844),
  ]) {
    testWidgets('七药确认与图案、三天计划和错误身份保护 $size', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final model = DemoModel(autoTick: false);
      addTearDown(model.dispose);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(body: PreparationPage(model: model)),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('prepare-r1')));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(milliseconds: 500));
      expect(find.text('本次用药 · 7 种'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('confirm-dispense')),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.byKey(const ValueKey('preparation-days')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('3 天').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('pattern-open')));
      await tester.pumpAndSettle();
      expect(find.text('摆药图案'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('关闭').last);
      await tester.pumpAndSettle();
      expect(find.text('摆药机未连接，请先连接设备'), findsOneWidget);
      expect(find.byKey(const ValueKey('box-feedback')), findsNothing);
      for (final feedback in [
        BoxFeedback.other,
        BoxFeedback.match,
        BoxFeedback.waiting,
        BoxFeedback.match,
      ]) {
        model.boxFeedback.value = feedback;
        await tester.pumpAndSettle();
        expect(
          tester
                  .widget<FilledButton>(
                    find.byKey(const ValueKey('confirm-dispense')),
                  )
                  .onPressed !=
              null,
          feedback == BoxFeedback.match,
        );
      }
      await tester.tap(find.byKey(const ValueKey('confirm-dispense')));
      await tester.pumpAndSettle();
      expect(model.stage, DispenseStage.running);
      expect(model.currentMedicine.target, 9);
      expect(model.taskMedicines.length, 7);
      expect(tester.takeException(), isNull);
    });
  }
}
