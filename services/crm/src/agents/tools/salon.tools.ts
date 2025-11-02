import { z } from 'zod';
import { tool } from '@openai/agents';
import { ServicesService } from '../../modules/services/services.service';
import { AppointmentsService } from '../../modules/appointments/appointments.service';

// Tool schemas using Zod
const GetServicesSchema = z.object({
  tenantId: z.string().uuid().describe('The client/tenant ID'),
});

const CheckAvailabilitySchema = z.object({
  tenantId: z.string().uuid().describe('The client/tenant ID'),
  serviceId: z.string().uuid().describe('The service ID to check availability for'),
  date: z.string().describe('The date to check in ISO format (YYYY-MM-DD)'),
});

const CreateAppointmentSchema = z.object({
  tenantId: z.string().uuid().describe('The tenant ID'),
  userId: z.string().uuid().optional().describe('The user ID if customer is known'),
  serviceId: z.string().uuid().describe('The service ID for the appointment'),
  scheduledAt: z.string().describe('Scheduled date and time in ISO format'),
  customerName: z.string().optional().describe('Customer name if not linked to user'),
  customerPhone: z.string().optional().describe('Customer phone if not linked to user'),
  notes: z.string().optional().describe('Additional notes for the appointment'),
});

const FindAppointmentsSchema = z.object({
  tenantId: z.string().uuid().describe('The client/tenant ID'),
  phoneNumber: z.string().describe('Customer phone number in E.164 format'),
});

const CancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid().describe('The appointment ID to cancel'),
  reason: z.string().optional().describe('Cancellation reason'),
});

// Tool definitions
export function createSalonTools(
  servicesService: ServicesService,
  appointmentsService: AppointmentsService,
) {
  return {
    get_services: tool({
      name: 'get_services',
      description: 'Obtiene la lista de servicios disponibles con precios y duraciones',
      parameters: GetServicesSchema,
      execute: async ({ tenantId }: z.infer<typeof GetServicesSchema>) => {
        try {
          const services = await servicesService.findByClient(tenantId);
          return {
            success: true,
            services: services.map(s => ({
              id: s.id,
              name: s.name,
              description: s.description,
              duration_minutes: s.duration_minutes,
              price: s.price,
              currency: s.currency,
            })),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Error fetching services',
          };
        }
      },
    }),

    check_availability: tool({
      name: 'check_availability',
      description: 'Verifica los horarios disponibles para un servicio en una fecha específica',
      parameters: CheckAvailabilitySchema,
      execute: async ({ tenantId, serviceId, date }: z.infer<typeof CheckAvailabilitySchema>) => {
        try {
          const targetDate = new Date(date);
          const slots = await appointmentsService.findAvailableSlots(tenantId, serviceId, targetDate);

          return {
            success: true,
            date,
            availableSlots: slots.map(slot => ({
              start: slot.start.toISOString(),
              end: slot.end.toISOString(),
              startTime: slot.start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
              endTime: slot.end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
            })),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Error checking availability',
          };
        }
      },
    }),

    create_appointment: tool({
      name: 'create_appointment',
      description: 'Crea una nueva cita. SOLO usar después de confirmar TODOS los detalles con el cliente',
      parameters: CreateAppointmentSchema,
      execute: async (params: z.infer<typeof CreateAppointmentSchema>) => {
        try {
          const appointment = await appointmentsService.create(params.tenantId, {
            userId: params.userId,
            serviceId: params.serviceId,
            scheduledAt: new Date(params.scheduledAt),
            customerName: params.customerName,
            customerPhone: params.customerPhone,
            notes: params.notes,
          });

          return {
            success: true,
            appointment: {
              id: appointment.id,
              scheduled_at: appointment.scheduled_at.toISOString(),
              status: appointment.status,
              customer_name: appointment.customer_name,
              customer_phone: appointment.customer_phone,
            },
            message: 'Cita creada exitosamente',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Error creating appointment',
          };
        }
      },
    }),

    find_appointments: tool({
      name: 'find_appointments',
      description: 'Busca las citas existentes de un cliente por número de teléfono',
      parameters: FindAppointmentsSchema,
      execute: async ({ tenantId, phoneNumber }: z.infer<typeof FindAppointmentsSchema>) => {
        try {
          const appointments = await appointmentsService.findByPhone(tenantId, phoneNumber);

          return {
            success: true,
            appointments: appointments.map(apt => ({
              id: apt.id,
              service_name: apt.service.name,
              scheduled_at: apt.scheduled_at.toISOString(),
              scheduled_time: apt.scheduled_at.toLocaleString('es-ES', {
                dateStyle: 'full',
                timeStyle: 'short',
              }),
              status: apt.status,
              notes: apt.notes,
            })),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Error finding appointments',
          };
        }
      },
    }),

    cancel_appointment: tool({
      name: 'cancel_appointment',
      description: 'Cancela una cita existente',
      parameters: CancelAppointmentSchema,
      execute: async ({ appointmentId, reason }: z.infer<typeof CancelAppointmentSchema>) => {
        try {
          const appointment = await appointmentsService.cancel(appointmentId, reason);

          return {
            success: true,
            appointment: {
              id: appointment.id,
              status: appointment.status,
              cancellation_reason: appointment.cancellation_reason,
            },
            message: 'Cita cancelada exitosamente',
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Error canceling appointment',
          };
        }
      },
    }),
  };
}
