import 'package:flutter/material.dart';

class PillxaiMark extends StatelessWidget {
  const PillxaiMark({super.key, this.size = 28});
  final double size;
  @override
  Widget build(BuildContext context) => Semantics(
    label: 'Pillxa 标志',
    child: CustomPaint(size: Size(size, size * 1.25), painter: _MarkPainter()),
  );
}

class _MarkPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xff111111);
    final top = Path()
      ..moveTo(0, size.height * .48)
      ..lineTo(0, size.width * .48)
      ..cubicTo(0, 0, size.width, 0, size.width, size.width * .48)
      ..cubicTo(
        size.width,
        size.height * .65,
        size.width * .36,
        size.height * .5,
        0,
        size.height * .63,
      )
      ..close();
    canvas.drawPath(top, paint);
    canvas.drawRRect(
      RRect.fromRectAndCorners(
        Rect.fromLTWH(
          0,
          size.height * .70,
          size.width * .42,
          size.height * .30,
        ),
        topLeft: Radius.circular(size.width * .22),
        bottomRight: Radius.circular(size.width * .22),
      ),
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
