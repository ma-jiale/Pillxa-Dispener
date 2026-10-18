import 'package:flutter/material.dart';

/// Profile photos keep their own colors and are always cropped to a circle.
class ProfileAvatar extends StatelessWidget {
  const ProfileAvatar({
    super.key,
    required this.label,
    this.asset,
    this.size = 36,
  });
  final String label;
  final String? asset;
  final double size;

  @override
  Widget build(BuildContext context) => Semantics(
    label: label,
    image: true,
    child: ClipOval(
      child: SizedBox.square(
        dimension: size,
        child: asset == null
            ? const ColoredBox(
                color: Color(0xfff0efed),
                child: Icon(
                  Icons.person_outline_rounded,
                  color: Color(0xff777777),
                ),
              )
            : Image.asset(
                asset!,
                fit: BoxFit.cover,
                excludeFromSemantics: true,
              ),
      ),
    ),
  );
}
