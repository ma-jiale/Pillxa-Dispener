import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/main.dart';
import 'package:pillxai_client/widgets/app_menu.dart';
import 'package:pillxai_client/models/demo_model.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    final font = FontLoader('NotoSansSC')
      ..addFont(rootBundle.load('assets/fonts/NotoSansCJKsc-Regular.otf'));
    await font.load();
  });

  Future<DemoModel> openApp(WidgetTester tester, {int page = 0}) async {
    tester.view.physicalSize = const Size(1280, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final model = DemoModel(autoTick: false);
    addTearDown(model.dispose);
    await tester.pumpWidget(PillxaiApp(model: model, initiallySignedIn: true));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(ValueKey('nav-$page')));
    await tester.pumpAndSettle();
    return model;
  }

  Finder field(String label) => find.byWidgetPredicate(
    (widget) => widget is TextField && widget.decoration?.labelText == label,
  );

  Future<void> tapVisible(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('姓名床位搜索为空时隐藏原长者详情，清空后恢复选择', (tester) async {
    await openApp(tester);
    final search = find.byWidgetPredicate(
      (widget) =>
          widget is TextField && widget.decoration?.hintText == '搜索姓名、床位',
    );

    await tester.enterText(search, '不存在的长者');
    await tester.pumpAndSettle();

    expect(find.text('没有匹配的长者'), findsOneWidget);
    expect(find.text('未找到长者，请调整搜索内容。'), findsOneWidget);
    expect(find.text('当前用药'), findsNothing);
    expect(find.text('预览摆药'), findsNothing);

    await tapVisible(tester, find.byTooltip('清空搜索'));
    expect(find.text('当前用药'), findsOneWidget);
    expect(find.text('王奶奶'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('添加长者校验姓名与床位冲突，失败保留输入，成功选中新长者', (tester) async {
    final model = await openApp(tester);
    final previousCount = model.residents.length;
    await tapVisible(tester, find.text('添加长者'));

    await tapVisible(tester, find.text('保存'));
    expect(find.text('请输入长者姓名'), findsOneWidget);
    expect(model.residents.length, previousCount);

    await tester.enterText(field('姓名'), '周奶奶');
    await tester.enterText(field('床位（选填）'), ' 208 床 ');
    await tapVisible(tester, find.text('保存'));
    expect(find.text('该床位已属于王奶奶'), findsOneWidget);
    expect(tester.widget<TextField>(field('姓名')).controller?.text, '周奶奶');
    expect(model.residents.length, previousCount);

    await tester.enterText(field('床位（选填）'), ' 301 床 ');
    await tapVisible(tester, find.text('保存'));
    expect(find.byType(AlertDialog), findsNothing);
    expect(model.residents.length, previousCount + 1);
    expect(model.selectedResident.name, '周奶奶');
    expect(model.selectedResident.bed, '301 床');
    expect(find.text('还没有用药条目'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('编辑药物只改变处方，已经创建的任务保留原始用药内容', (tester) async {
    final model = await openApp(tester);
    final originalName = model.currentMedicine.name;
    final originalStrength = model.currentMedicine.strength;
    final originalTarget = model.currentMedicine.target;
    await tapVisible(tester, find.byTooltip('编辑示例药 A'));
    await tester.enterText(field('药物名称'), '修改后的演示药');
    await tester.enterText(field('规格'), '20 mg / 片');
    await tapVisible(tester, find.text('保存'));

    expect(model.selectedResident.medicines.first.name, '修改后的演示药');
    expect(model.selectedResident.medicines.first.strength, '20 mg / 片');
    expect(model.currentMedicine.name, originalName);
    expect(model.currentMedicine.strength, originalStrength);
    expect(model.currentMedicine.target, originalTarget);
    expect(
      model.selectedResident.medicines.first.imageAsset,
      'assets/images/medicine-a.png',
    );

    await tapVisible(tester, find.byKey(const ValueKey('nav-1')));
    expect(find.text(originalName), findsWidgets);
    expect(find.text('修改后的演示药'), findsNothing);
    expect(model.stage, DispenseStage.awaitingVerification);
    expect(tester.takeException(), isNull);
  });

  testWidgets('空床位可保存，编辑资料后仍在统一列表并保留原身份', (tester) async {
    final model = await openApp(tester);
    await tapVisible(tester, find.text('添加长者'));
    await tester.enterText(field('姓名'), '周奶奶');
    await tapVisible(tester, find.text('保存'));
    final id = model.selectedResident.id;
    expect(model.selectedResident.bed, isEmpty);

    await tapVisible(tester, find.text('编辑资料'));
    await tester.enterText(field('姓名'), '周女士');
    await tapVisible(tester, find.text('保存'));

    expect(model.selectedResident.id, id);
    expect(model.selectedResident.name, '周女士');
    expect(find.text('周女士'), findsWidgets);
    expect(find.text('预览摆药'), findsOneWidget);
    expect(find.text('在院'), findsNothing);
    expect(find.text('已离院'), findsNothing);
    expect(find.text('王奶奶'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('结构化剂量和疗程保留输入，拒绝不匹配投料及无效日期', (tester) async {
    final model = await openApp(tester);
    await tapVisible(tester, find.byTooltip('编辑示例药 A'));
    await tester.ensureVisible(find.byKey(const ValueKey('dose-0')));
    await tester.enterText(find.byKey(const ValueKey('dose-0')), '0.5');
    await tester.enterText(find.byKey(const ValueKey('dose-1')), '0');
    await tester.enterText(find.byKey(const ValueKey('dose-2')), '0');
    await tapVisible(tester, find.text('保存'));
    expect(find.text('整片 / 整粒填整数'), findsOneWidget);
    expect(model.selectedResident.medicines.first.doses.morning, 1);

    await tapVisible(tester, find.byType(AppSelect<bool>));
    await tapVisible(tester, find.text('预切半片').last);
    await tester.ensureVisible(field('开始日期'));
    await tester.enterText(field('开始日期'), '2026-10-18');
    await tapVisible(tester, find.byType(SwitchListTile));
    await tester.ensureVisible(field('结束日期'));
    await tester.enterText(field('结束日期'), '2026-02-30');
    await tapVisible(tester, find.text('保存'));
    expect(find.text('请填写有效日期，如 2026-10-18'), findsOneWidget);
    await tester.enterText(field('结束日期'), '2026-10-17');
    await tapVisible(tester, find.text('保存'));
    expect(find.text('结束日期不能早于开始日期'), findsOneWidget);
    await tester.enterText(field('结束日期'), '2026-10-20');
    await tapVisible(tester, find.text('保存'));

    final medicine = model.selectedResident.medicines.first;
    expect(medicine.id, 'm1');
    expect(medicine.doses.morning, .5);
    expect(medicine.doses.noon, 0);
    expect(medicine.form, '预切半片');
    expect(medicine.startDate, DateTime(2026, 10, 18));
    expect(medicine.endDate, DateTime(2026, 10, 20));
    expect(model.currentMedicine.doses.morning, 1);
    expect(tester.takeException(), isNull);
  });

  testWidgets('停用与恢复保留用药身份，已创建的任务不随之变化', (tester) async {
    final model = await openApp(tester);
    await tapVisible(tester, find.byTooltip('示例药 A更多操作'));
    await tapVisible(tester, find.text('停用用药'));
    await tapVisible(tester, find.text('确认停用'));
    expect(model.selectedResident.medicines.first.stopped, isTrue);
    expect(model.currentMedicine.stopped, isFalse);

    await tapVisible(tester, find.text('已停用用药 · 1'));
    await tapVisible(tester, find.byTooltip('示例药 A更多操作'));
    await tapVisible(tester, find.text('恢复用药'));
    await tapVisible(tester, find.text('确认恢复'));
    expect(model.selectedResident.medicines.first.id, 'm1');
    expect(model.selectedResident.medicines.first.stopped, isFalse);
    expect(model.selectedResident.medicines.length, 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('取消未保存表单时可继续编辑，放弃后保持原处方', (tester) async {
    final model = await openApp(tester);
    await tapVisible(tester, find.byTooltip('编辑示例药 A'));
    await tester.enterText(field('药物名称'), '未保存的名称');
    await tapVisible(tester, find.text('取消'));
    expect(find.text('放弃未保存的修改？'), findsOneWidget);
    await tapVisible(tester, find.text('继续编辑'));
    expect(tester.widget<TextField>(field('药物名称')).controller?.text, '未保存的名称');
    await tapVisible(tester, find.text('取消'));
    await tapVisible(tester, find.text('放弃修改'));
    expect(model.selectedResident.medicines.first.name, '示例药 A');
    expect(tester.takeException(), isNull);
  });

  testWidgets('强调色通过设置应用到操作控件，药图保持原图且没有着色或灰度过滤', (tester) async {
    await openApp(tester, page: 1);
    final originalImages = tester
        .widgetList<Image>(find.byType(Image))
        .map((image) => image.image)
        .toList();
    expect(originalImages, isNotEmpty);

    await tapVisible(tester, find.byKey(const ValueKey('nav-2')));
    await tapVisible(tester, find.byKey(const ValueKey('settings-appearance')));
    final customColor = find.byKey(const ValueKey('custom-accent-input'));
    await tester.enterText(customColor, '#XYZ');
    await tapVisible(tester, find.text('应用'));
    expect(find.text('请输入 6 位颜色代码，如 #2867BD'), findsOneWidget);

    await tester.enterText(customColor, '#2867BD');
    await tapVisible(tester, find.text('应用'));
    expect(find.text('请输入 6 位颜色代码，如 #2867BD'), findsNothing);
    await tapVisible(tester, find.byKey(const ValueKey('nav-1')));

    final action = find.byKey(const ValueKey('dispense-primary'));
    expect(
      Theme.of(tester.element(action)).colorScheme.primary,
      const Color(0xff2867bd),
    );
    final images = tester.widgetList<Image>(find.byType(Image)).toList();
    expect(images.map((image) => image.image).toList(), originalImages);
    for (final image in images) {
      expect(image.color, isNull, reason: '药品图片不能跟随强调色着色');
      expect(image.colorBlendMode, isNull);
      expect(
        find.ancestor(
          of: find.byWidget(image),
          matching: find.byType(ColorFiltered),
        ),
        findsNothing,
        reason: '药品图片不能为了黑白界面而加灰度过滤',
      );
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('新增用药拒绝全零、负数和非有限剂量', (tester) async {
    final model = await openApp(tester);
    await tapVisible(tester, find.text('添加药物'));
    await tester.enterText(field('药物名称'), '新演示药');
    await tester.enterText(field('规格'), '1 mg / 片');
    await tapVisible(tester, find.text('保存'));
    expect(find.text('至少填写一个时段的正用量。'), findsOneWidget);
    for (final invalidDose in ['-1', 'NaN', 'Infinity']) {
      await tester.ensureVisible(find.byKey(const ValueKey('dose-0')));
      await tester.enterText(find.byKey(const ValueKey('dose-0')), invalidDose);
      await tapVisible(tester, find.text('保存'));
      expect(find.text('请输入非负用量'), findsOneWidget);
      expect(model.selectedResident.medicines.length, 2);
    }
    expect(tester.takeException(), isNull);
  });

  testWidgets('长姓名与长床位保存后在窄屏不溢出', (tester) async {
    final model = await openApp(tester);
    await tapVisible(tester, find.text('添加长者'));
    await tester.enterText(field('姓名'), List.filled(10, '长者名').join());
    await tester.enterText(field('床位（选填）'), List.filled(10, '楼层床位').join());
    await tapVisible(tester, find.text('保存'));
    expect(model.selectedResident.name.length, 30);
    tester.view.physicalSize = const Size(390, 844);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('当前用药'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });
}
