import 'demo_model.dart';

/// Local GUI preview only; coverage and device feedback are not production data.
class PreparationPlan {
  PreparationPlan(
    this.resident,
    this.start,
    this.days, {
    required this.bedtime,
  }) {
    if (days < 1 || days > 7) throw RangeError.range(days, 1, 7, 'days');
    for (final medicine in resident.medicines) {
      if (medicine.stopped) continue;
      if (!bedtime && medicine.doses.night > 0) issue = '处方含睡前用药，请先在设置启用睡前格';
      if (medicine.doses.values.any(
        (dose) =>
            !dose.isFinite ||
            dose < 0 ||
            (medicine.form == '预切半片'
                ? dose != 0 && dose != .5
                : dose != dose.roundToDouble()),
      )) {
        issue = '${medicine.name}的用量与投料形态不匹配';
        continue;
      }
      final count =
          List.generate(
                days,
                (day) => DateTime(start.year, start.month, start.day + day),
              )
              .where(medicine.isEffectiveOn)
              .fold<int>(
                0,
                (sum, date) =>
                    sum +
                    List.generate(
                      bedtime ? 4 : 3,
                      (slot) => particles(medicine, slot, date),
                    ).fold(0, (a, b) => a + b),
              );
      if (count > 0) medicines.add(medicine.copyWith(target: count));
    }
  }
  final Resident resident;
  final DateTime start;
  final int days;
  final bool bedtime;
  final List<Medicine> medicines = [];
  String? issue;
  DateTime get end => DateTime(start.year, start.month, start.day + days - 1);
  static String date(DateTime value) => '${value.month}/${value.day}';
  String get dates => '${date(start)} — ${date(end)}';
  static int particles(Medicine medicine, int slot, DateTime date) {
    if (!medicine.isEffectiveOn(date)) return 0;
    return (medicine.doses.values[slot] * (medicine.form == '预切半片' ? 2 : 1))
        .round();
  }
}
