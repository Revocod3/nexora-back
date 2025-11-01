import { DataSource } from 'typeorm';
import { Service, Client } from '../entities';

export async function seedServices(dataSource: DataSource, clientId: string) {
  const serviceRepo = dataSource.getRepository(Service);
  const clientRepo = dataSource.getRepository(Client);

  const client = await clientRepo.findOne({ where: { id: clientId } });
  if (!client) {
    throw new Error(`Client ${clientId} not found`);
  }

  const services = [
    {
      name: 'Corte de pelo',
      description: 'Corte básico con lavado',
      duration_minutes: 45,
      price: 25.00,
      currency: 'EUR',
      client,
    },
    {
      name: 'Tinte completo',
      description: 'Tinte de raíces a puntas',
      duration_minutes: 120,
      price: 80.00,
      currency: 'EUR',
      client,
    },
    {
      name: 'Mechas',
      description: 'Mechas californianas',
      duration_minutes: 90,
      price: 60.00,
      currency: 'EUR',
      client,
    },
    {
      name: 'Manicura',
      description: 'Manicura completa con esmaltado',
      duration_minutes: 30,
      price: 15.00,
      currency: 'EUR',
      client,
    },
  ];

  for (const serviceData of services) {
    const exists = await serviceRepo.findOne({
      where: { name: serviceData.name, client: { id: clientId } },
    });

    if (!exists) {
      await serviceRepo.save(serviceData);
      console.log(`✓ Created service: ${serviceData.name}`);
    }
  }
}
