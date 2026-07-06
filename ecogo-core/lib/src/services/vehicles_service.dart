import '../models/vehicle.dart';
import 'api_client.dart';

class VehiclesService {
  final ApiClient api;
  VehiclesService(this.api);

  Future<Vehicle> create({
    required String type,
    required String plate,
    required int seats,
    String? model,
    bool isEv = false,
  }) async {
    final r = await api.post('/vehicles', {
      'type': type,
      'plate': plate,
      'seats': seats,
      'model': model,
      'isEv': isEv,
    });
    return Vehicle.fromJson(r as Map<String, dynamic>);
  }

  Future<List<Vehicle>> mine() async {
    final r = await api.get('/vehicles/mine');
    return (r as List).map((e) => Vehicle.fromJson(e as Map<String, dynamic>)).toList();
  }
}
