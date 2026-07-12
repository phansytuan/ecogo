class Companion {
  final String fullName;
  final String phone;
  final String? email;

  Companion({required this.fullName, required this.phone, this.email});

  Map<String, dynamic> toJson() => {
        'fullName': fullName,
        'phone': phone,
        if (email != null && email!.trim().isNotEmpty) 'email': email!.trim(),
      };

  factory Companion.fromJson(Map<String, dynamic> j) => Companion(
        fullName: (j['fullName'] ?? j['full_name']) as String,
        phone: ((j['phone'] ?? '') as String?) ?? '',
        email: j['email'] as String?,
      );
}

/// How many companions a booking of [seats] seats must declare.
/// The account holder is passenger #1.
int requiredCompanions(int seats) => seats <= 1 ? 0 : seats - 1;
