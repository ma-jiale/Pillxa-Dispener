import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/widgets/medicine_card_deck.dart';

Widget deck(ValueNotifier<int> index, {bool reducedMotion = false}) =>
    MaterialApp(
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: reducedMotion),
        child: child!,
      ),
      home: Scaffold(
        body: LayoutBuilder(
          builder: (context, bounds) => ValueListenableBuilder<int>(
            valueListenable: index,
            builder: (context, value, _) => MedicineCardDeck(
              medicineId: '$value',
              nextMedicineId: value < 2 ? '${value + 1}' : null,
              stacked: bounds.maxWidth < 800,
              current: SizedBox(
                height: 200,
                child: Center(child: Text('current $value')),
              ),
              next: value < 2
                  ? SizedBox(
                      height: 100,
                      child: Center(child: Text('next ${value + 1}')),
                    )
                  : null,
            ),
          ),
        ),
      ),
    );

void main() {
  testWidgets('减少动态效果时直接显示当前药，不创建迁移卡片', (tester) async {
    final index = ValueNotifier(0);
    addTearDown(index.dispose);
    await tester.pumpWidget(deck(index, reducedMotion: true));
    index.value = 1;
    await tester.pump();
    expect(find.text('current 1'), findsOneWidget);
    expect(find.text('current 0'), findsNothing);
    expect(find.byKey(const ValueKey('medicine-promotion')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('连续切药和中途改变屏幕尺寸不残留上一药或错误动画', (tester) async {
    tester.view.physicalSize = const Size(1000, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final index = ValueNotifier(0);
    addTearDown(index.dispose);
    await tester.pumpWidget(deck(index));
    index.value = 1;
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 180));
    expect(find.byKey(const ValueKey('medicine-promotion')), findsOneWidget);
    index.value = 2;
    await tester.pump();
    tester.view.physicalSize = const Size(550, 700);
    await tester.pumpAndSettle();
    expect(find.text('current 2'), findsOneWidget);
    expect(find.text('current 0'), findsNothing);
    expect(find.text('current 1'), findsNothing);
    expect(find.byKey(const ValueKey('medicine-promotion')), findsNothing);
    expect(tester.takeException(), isNull);
  });
}
