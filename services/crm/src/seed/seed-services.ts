import { DataSource } from 'typeorm';
import { Service, Tenant } from '../entities';

export async function seedServices(dataSource: DataSource, clientId: string) {
  const serviceRepo = dataSource.getRepository(Service);
  const clientRepo = dataSource.getRepository(Tenant);

  const tenant = await clientRepo.findOne({ where: { id: clientId } });
  if (!tenant) {
    throw new Error(`Tenant ${clientId} not found`);
  }

  const services = [
    {
      name: 'Corte de pelo',
      description: 'Corte básico con lavado',
      duration_minutes: 45,
      price: 25.00,
      currency: 'EUR',
      tenant,
    },
    {
      name: 'Tinte completo',
      description: 'Tinte de raíces a puntas',
      duration_minutes: 120,
      price: 80.00,
      currency: 'EUR',
      tenant,
    },
    {
      name: 'Mechas',
      description: 'Mechas californianas',
      duration_minutes: 90,
      price: 60.00,
      currency: 'EUR',
      tenant,
    },
    {
      name: 'Manicura',
      description: 'Manicura completa con esmaltado',
      duration_minutes: 30,
      price: 15.00,
      currency: 'EUR',
      tenant,
    },
  ];

  for (const serviceData of services) {
    const exists = await serviceRepo.findOne({
      where: { name: serviceData.name, tenant: { id: clientId } },
    });

    if (!exists) {
      await serviceRepo.save(serviceData);
      console.log(`✓ Created service: ${serviceData.name}`);
    }
  }
}
