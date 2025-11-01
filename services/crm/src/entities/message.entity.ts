import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntityWithTimestamps } from './base.entity';
import { Conversation } from './conversation.entity';

export enum MessageDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  DOCUMENT = 'document',
  AUDIO = 'audio',
  VIDEO = 'video',
  LOCATION = 'location',
  CONTACT = 'contact',
  STICKER = 'sticker',
}

@Entity('messages')
export class Message extends BaseEntityWithTimestamps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Conversation, (conv) => conv.messages)
  @JoinColumn({ name: 'conversation_id' })
  conversation!: Conversation;

  @Column({
    type: 'enum',
    enum: MessageDirection,
  })
  direction!: MessageDirection;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  type!: MessageType;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  sent_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  delivered_at?: Date;

  @Column({ type: 'timestamp', nullable: true })
  read_at?: Date;
}
