import 'package:flutter/material.dart';

/// Original dispenser outline, shared by toolbar and device-panel icons.
class DispenserIcon extends StatelessWidget {
  const DispenserIcon({
    super.key,
    this.size = 24,
    this.color = const Color(0xff333333),
  });
  final double size;
  final Color color;
  @override
  Widget build(BuildContext context) =>
      CustomPaint(size: Size.square(size), painter: _DispenserPainter(color));
}

class _DispenserPainter extends CustomPainter {
  const _DispenserPainter(this.color);
  final Color color;
  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 32, size.height / 32);
    final line = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.65
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(3, 4, 26, 24),
        const Radius.circular(4),
      ),
      line,
    );
    final dot = Paint()..color = color;
    canvas.drawCircle(const Offset(9, 10), 1.6, dot);
    canvas.drawCircle(const Offset(23, 10), 1.6, dot);
    canvas.drawPath(
      Path()
        ..moveTo(7, 14)
        ..cubicTo(10, 21, 22, 21, 25, 14),
      line,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        const Rect.fromLTWH(7, 22, 18, 3),
        const Radius.circular(.7),
      ),
      line,
    );
    canvas.restore();
  }

  @override
  bool shouldRepaint(_DispenserPainter oldDelegate) =>
      oldDelegate.color != color;
}
