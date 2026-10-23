import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Promotes the visible next card from its actual slot into the current slot.
/// Animation owns presentation only; it never starts or delays a medicine.
class MedicineCardDeck extends StatefulWidget {
  const MedicineCardDeck({
    super.key,
    required this.medicineId,
    required this.nextMedicineId,
    required this.current,
    required this.next,
    required this.stacked,
  });

  final String medicineId;
  final String? nextMedicineId;
  final Widget current;
  final Widget? next;
  final bool stacked;

  @override
  State<MedicineCardDeck> createState() => _MedicineCardDeckState();
}

class _MedicineCardDeckState extends State<MedicineCardDeck>
    with SingleTickerProviderStateMixin {
  final _deckKey = GlobalKey();
  final _currentKey = GlobalKey();
  final _nextKey = GlobalKey();
  late final _controller =
      AnimationController(
        vsync: this,
        duration: const Duration(milliseconds: 680),
      )..addStatusListener((status) {
        if (status == AnimationStatus.completed && mounted) {
          setState(_clearFlight);
        }
      });
  Widget? _departing;
  Widget? _promoting;
  Rect? _fromCurrent;
  Rect? _fromNext;
  Rect? _toCurrent;
  Rect? _toNext;
  int _flight = 0;

  bool get _moving => _promoting != null;

  Rect? _bounds(GlobalKey key) {
    final root = _deckKey.currentContext?.findRenderObject();
    final box = key.currentContext?.findRenderObject();
    if (root is! RenderBox || box is! RenderBox || !box.hasSize) return null;
    return box.localToGlobal(Offset.zero, ancestor: root) & box.size;
  }

  void _clearFlight() {
    _departing = null;
    _promoting = null;
    _fromCurrent = null;
    _fromNext = null;
    _toCurrent = null;
    _toNext = null;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Resize and reduced motion keep the latest state usable immediately.
    MediaQuery.sizeOf(context);
    MediaQuery.disableAnimationsOf(context);
    _flight++;
    _controller.stop();
    _clearFlight();
  }

  @override
  void didUpdateWidget(MedicineCardDeck oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.medicineId == oldWidget.medicineId) return;
    final currentRect = _bounds(_currentKey);
    final nextRect = _bounds(_nextKey);
    _controller.stop();
    _clearFlight();
    final flight = ++_flight;
    if (MediaQuery.disableAnimationsOf(context) ||
        widget.stacked != oldWidget.stacked ||
        oldWidget.nextMedicineId != widget.medicineId ||
        currentRect == null ||
        nextRect == null) {
      return;
    }
    _departing = oldWidget.current;
    _promoting = oldWidget.next;
    _fromCurrent = currentRect;
    _fromNext = nextRect;
    _toCurrent = currentRect;
    _controller.value = 0;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || flight != _flight || !_moving) return;
      setState(() {
        _toCurrent = _bounds(_currentKey) ?? currentRect;
        _toNext = _bounds(_nextKey);
      });
      _controller.forward();
    });
  }

  Widget _slot(GlobalKey key, Widget content) => SizedBox(
    key: key,
    child: Surface(
      key: ValueKey(
        key == _currentKey ? 'medicine-current-slot' : 'medicine-next-slot',
      ),
      child: content,
    ),
  );

  Widget _layout() {
    final current = _slot(_currentKey, widget.current);
    final next = widget.next == null ? null : _slot(_nextKey, widget.next!);
    if (widget.stacked) {
      return Column(
        children: [
          current,
          if (next != null) ...[const SizedBox(height: 18), next],
        ],
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: current),
        if (next != null) ...[
          const SizedBox(width: 24),
          SizedBox(width: 224, child: next),
        ],
      ],
    );
  }

  // Fixed content constraints prevent text reflow or overflow during the flight.
  Widget _contentAtSize(Widget content, Size cardSize) => SizedBox.expand(
    child: FittedBox(
      fit: BoxFit.contain,
      child: SizedBox(
        width: cardSize.width - 48,
        height: cardSize.height - 48,
        child: content,
      ),
    ),
  );

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, _) {
      final t = _controller.value;
      final travel = Curves.easeOutCubic.transform((t / .85).clamp(0, 1));
      final reveal = const Interval(
        .35,
        .85,
        curve: Curves.easeInOut,
      ).transform(t);
      final departure = const Interval(
        0,
        .65,
        curve: Curves.easeInCubic,
      ).transform(t);
      final replenish = const Interval(
        .65,
        1,
        curve: Curves.easeOut,
      ).transform(t);
      return ClipRect(
        child: Stack(
          key: _deckKey,
          children: [
            IgnorePointer(
              ignoring: _moving,
              child: ExcludeSemantics(
                excluding: _moving,
                child: Opacity(opacity: _moving ? 0 : 1, child: _layout()),
              ),
            ),
            if (_moving) ...[
              Positioned.fromRect(
                rect: _fromCurrent!.shift(
                  widget.stacked
                      ? Offset(0, -_fromCurrent!.height * .35 * departure)
                      : Offset(-_fromCurrent!.width * .45 * departure, 0),
                ),
                child: ExcludeSemantics(
                  child: Opacity(
                    opacity: 1 - departure,
                    child: Surface(
                      key: const ValueKey('medicine-departure'),
                      child: _contentAtSize(_departing!, _fromCurrent!.size),
                    ),
                  ),
                ),
              ),
              if (_toNext != null && widget.next != null)
                Positioned.fromRect(
                  rect: _toNext!.shift(
                    widget.stacked
                        ? Offset(0, 24 * (1 - replenish))
                        : Offset(36 * (1 - replenish), 0),
                  ),
                  child: ExcludeSemantics(
                    child: Opacity(
                      opacity: replenish,
                      child: Surface(child: widget.next!),
                    ),
                  ),
                ),
              Positioned.fromRect(
                rect: Rect.lerp(_fromNext, _toCurrent, travel)!,
                child: Surface(
                  key: const ValueKey('medicine-promotion'),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      ExcludeSemantics(
                        child: Opacity(
                          opacity: 1 - reveal,
                          child: _contentAtSize(_promoting!, _fromNext!.size),
                        ),
                      ),
                      Opacity(
                        opacity: reveal,
                        child: _contentAtSize(widget.current, _toCurrent!.size),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      );
    },
  );

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
}
