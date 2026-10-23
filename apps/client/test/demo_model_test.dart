import 'package:flutter_test/flutter_test.dart';
import 'package:pillxai_client/models/demo_model.dart';

void main() {
  late DemoModel model;

  Resident shortTask() => Resident(
    id: 'test-resident',
    name: '测试长者',
    bed: '测试床位',
    medicines: [
      const Medicine(id: 'first', name: '第一种演示药', strength: '10 mg', target: 2),
      const Medicine(id: 'second', name: '第二种演示药', strength: '5 mg', target: 1),
    ],
  );

  void startShortTask() {
    expect(model.prepareTask(shortTask()), isTrue);
    model.verifyBox();
    model.start();
  }

  setUp(() => model = DemoModel(autoTick: false));
  tearDown(() => model.dispose());

  test('未识别药盒时，开始和计数请求均不执行', () {
    expect(model.stage, DispenseStage.awaitingVerification);

    model.start();
    model.advance();

    expect(model.stage, DispenseStage.awaitingVerification);
    expect(model.count, 0);
    expect(model.medicineIndex, 0);
  });

  test('识别只允许开始，不会自行启动；暂停保留进度，继续后接着计数', () {
    model.verifyBox();
    expect(model.stage, DispenseStage.ready);
    model.advance();
    expect(model.count, 0);

    model.start();
    model.advance();
    expect(model.stage, DispenseStage.running);
    expect(model.count, 1);

    model.pause();
    model.advance();
    model.advance();
    expect(model.stage, DispenseStage.paused);
    expect(model.count, 1);

    model.start();
    model.advance();
    expect(model.stage, DispenseStage.running);
    expect(model.count, 2);
  });

  test('本药结束后自动切换并开始下一药，计数和开口重置且仍可暂停', () {
    startShortTask();
    model.setOpening(.42);
    model.advance();
    model.advance();

    expect(model.stage, DispenseStage.running);
    expect(model.currentMedicine.id, 'second');
    expect(model.nextMedicine, isNull);
    expect(model.count, 0);
    expect(model.opening, .70);
    model.start();
    expect(model.stage, DispenseStage.running);
    expect(model.currentMedicine.id, 'second');
    expect(model.count, 0);
    model.pause();
    model.advance();
    expect(model.count, 0);
    expect(model.medicineIndex, 1);
    model.start();
    model.advance();
    expect(model.stage, DispenseStage.completed);
    expect(model.count, 1);
  });

  test('自动切药不提前更新覆盖，最后一药完成才保存覆盖日期', () {
    final resident = model.residents.first;
    final end = DateTime(2026, 10, 29);
    expect(
      model.startPreparedTask(resident, [
        resident.medicines[0].copyWith(target: 1),
        resident.medicines[1].copyWith(target: 2),
      ], end: end),
      isTrue,
    );
    model.advance();
    expect(model.stage, DispenseStage.running);
    expect(model.medicineIndex, 1);
    expect(model.count, 0);
    expect(model.demoCoverage[resident.id], isNull);
    model.advance();
    expect(model.count, 1);
    expect(model.demoCoverage[resident.id], isNull);
    model.advance();
    expect(model.stage, DispenseStage.completed);
    expect(model.demoCoverage[resident.id], end);
  });

  test('最后一种药完成后不再增加计数，也不能再次开始', () {
    startShortTask();
    model.advance();
    model.advance();
    model.start();
    model.advance();

    expect(model.stage, DispenseStage.completed);
    expect(model.count, 1);
    expect(model.nextMedicine, isNull);
    expect(model.active, isFalse);

    model.advance();
    model.start();
    expect(model.stage, DispenseStage.completed);
    expect(model.count, 1);
    expect(model.medicineIndex, 1);
  });

  test('取消后保留最后进度，但不再执行或继续', () {
    startShortTask();
    model.advance();
    model.cancel();

    model.advance();
    model.start();
    model.verifyBox();

    expect(model.stage, DispenseStage.cancelled);
    expect(model.count, 1);
    expect(model.active, isFalse);
  });

  test('保存和增删处方条目不会改写已经创建的任务快照', () {
    final resident = model.residents.first;
    final originalFirst = resident.medicines.first;
    final originalIds = resident.medicines
        .map((medicine) => medicine.id)
        .toList();
    final originalName = resident.name;
    final originalBed = resident.bed;

    model.saveMedicine(
      resident.id,
      originalFirst.copyWith(name: '已修改药名', strength: '99 mg'),
    );
    model.saveMedicine(
      resident.id,
      const Medicine(id: 'added', name: '新药', strength: '1 mg'),
    );
    resident.medicines.clear();
    resident.name = '已修改姓名';
    resident.bed = '新床位';

    expect(model.taskMedicines.map((medicine) => medicine.id), originalIds);
    expect(model.currentMedicine.name, originalFirst.name);
    expect(model.currentMedicine.strength, originalFirst.strength);
    expect(model.taskResidentName, originalName);
    expect(model.taskResidentBed, originalBed);
  });

  for (final blockedStage in [DispenseStage.running, DispenseStage.paused]) {
    test('$blockedStage 时不能创建新任务或覆盖已有进度', () {
      startShortTask();
      model.advance();
      if (blockedStage == DispenseStage.paused) model.pause();
      final previousCount = model.count;
      final previousMedicine = model.currentMedicine.id;

      final accepted = model.prepareTask(model.residents[1]);

      expect(accepted, isFalse);
      expect(model.stage, blockedStage);
      expect(model.count, previousCount);
      expect(model.currentMedicine.id, previousMedicine);
      expect(model.taskResidentName, '测试长者');
    });
  }

  test('没有药物的长者不能建立任务，已有准备内容保持原样', () {
    final resident = Resident(
      id: 'empty',
      name: '无用药长者',
      bed: '',
      medicines: [],
    );
    final previousResident = model.taskResidentName;
    final previousMedicine = model.currentMedicine.id;

    expect(model.prepareTask(resident), isFalse);
    expect(model.taskResidentName, previousResident);
    expect(model.currentMedicine.id, previousMedicine);
    expect(model.stage, DispenseStage.awaitingVerification);
  });

  test('准备演示排除停用、未生效及已结束药物，结束当天仍有效', () {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final resident = Resident(
      id: 'dates',
      name: '测试长者',
      bed: '',
      medicines: [
        Medicine(
          id: 'today',
          name: '今日有效',
          strength: '1 mg',
          startDate: today,
          endDate: today,
        ),
        const Medicine(
          id: 'stopped',
          name: '已停用',
          strength: '1 mg',
          stopped: true,
        ),
        Medicine(
          id: 'expired',
          name: '已过期',
          strength: '1 mg',
          endDate: today.subtract(const Duration(days: 1)),
        ),
        Medicine(
          id: 'future',
          name: '尚未开始',
          strength: '1 mg',
          startDate: today.add(const Duration(days: 1)),
        ),
      ],
    );
    expect(model.prepareTask(resident), isTrue);
    expect(model.taskMedicines.map((medicine) => medicine.id), ['today']);
  });

  test('睡前用药需要启用睡前格，不能静默遗漏需求', () {
    final resident = Resident(
      id: 'night',
      name: '测试长者',
      bed: '',
      medicines: [
        const Medicine(
          id: 'night',
          name: '睡前药',
          strength: '1 mg',
          doses: DoseSchedule(morning: 0, noon: 0, evening: 0, night: 1),
        ),
      ],
    );
    expect(model.prepareTask(resident), isFalse);
    expect(model.preparationIssue(resident), contains('睡前格'));
    model.saveSettings(days: 7, split: true, night: true, tomorrow: false);
    expect(model.prepareTask(resident), isTrue);
    expect(model.currentMedicine.doses.night, 1);
  });

  test('空床位不冲突，修改原资料保留身份及已登记床位', () {
    expect(model.bedConflict(''), isNull);
    expect(model.bedConflict(' 208床 ')?.id, 'r1');
    expect(model.bedConflict('208 床', excludingId: 'r1'), isNull);
    final original = model.residents.first;
    model.saveResident(
      Resident(
        id: original.id,
        name: '王女士',
        bed: original.bed,
        medicines: original.medicines,
      ),
    );
    expect(model.residents.length, 4);
    expect(model.selectedResident.id, 'r1');
    expect(model.selectedResident.name, '王女士');
    expect(model.bedConflict('208 床')?.id, 'r1');
    expect(model.taskResidentName, '王奶奶');
  });
}
