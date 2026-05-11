import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import logger from '../utils/logger';

class SocketService {
  private io: SocketIOServer | null = null;
  private static instance: SocketService;

  // Événements personnalisés
  public static readonly EVENTS = {
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',
    ERROR: 'error',
    // Ajoutez ici vos événements personnalisés
    // Exemple:
    // NEW_MESSAGE: 'new_message',
  };


  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public initialize(server: HttpServer | SocketIOServer): void {
    if (this.io) {
      logger.warn('Le service de socket est déjà initialisé');
      return;
    }

    // Créer une nouvelle instance de Socket.IO
    if (server instanceof HttpServer) {
      this.io = new SocketIOServer(server, {
        cors: {
          origin: '*', // À restreindre en production
          methods: ['GET', 'POST'],
        },
      });
    } else {
      this.io = server;
    }

    this.setupEventHandlers();
    logger.info('Service de socket initialisé');
  }

  private setupEventHandlers(): void {
    if (!this.io) {
      throw new Error('Le serveur Socket.IO n\'est pas initialisé');
    }

    // Gestion des connexions
    this.io.on(SocketService.EVENTS.CONNECTION, (socket: Socket) => {
      const clientId = socket.id;
      logger.info(`Nouvelle connexion socket: ${clientId}`);

      // Gestion des erreurs
      socket.on(SocketService.EVENTS.ERROR, (error: Error) => {
        logger.error(`Erreur socket (${clientId}):`, error);
      });

      // Gestion de la déconnexion
      socket.on(SocketService.EVENTS.DISCONNECT, (reason: string) => {
        logger.info(`Déconnexion socket (${clientId}): ${reason}`);
      });

      // Ajoutez ici vos gestionnaires d'événements personnalisés
      // Exemple:
      // socket.on(SocketService.EVENTS.NEW_MESSAGE, this.handleNewMessage);
    });
  }

  // Exemple de méthode pour émettre un événement à tous les clients
  public emitToAll(event: string, data: any): void {
    if (!this.io) {
      throw new Error('Le serveur Socket.IO n\'est pas initialisé');
    }
    this.io.emit(event, data);
  }

  // Exemple de méthode pour émettre un événement à une salle spécifique
  public emitToRoom(room: string, event: string, data: any): void {
    if (!this.io) {
      throw new Error('Le serveur Socket.IO n\'est pas initialisé');
    }
    this.io.to(room).emit(event, data);
  }

  // Exemple de méthode pour rejoindre une salle
  public joinRoom(socketId: string, room: string): void {
    const socket = this.io?.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(room);
      logger.info(`Socket ${socketId} a rejoint la salle ${room}`);
    }
  }

  // Exemple de méthode pour quitter une salle
  public leaveRoom(socketId: string, room: string): void {
    const socket = this.io?.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(room);
      logger.info(`Socket ${socketId} a quitté la salle ${room}`);
    }
  }

  // Obtenir le nombre de clients connectés
  public getConnectedClientsCount(): number {
    if (!this.io) return 0;
    return this.io.engine.clientsCount;
  }

  // Obtenir les IDs des salles actives
  public getActiveRooms(): string[] {
    if (!this.io) return [];
    return Array.from(this.io.sockets.adapter.rooms.keys());
  }

  // Vérifier si un socket est connecté
  public isSocketConnected(socketId: string): boolean {
    if (!this.io) return false;
    return this.io.sockets.sockets.has(socketId);
  }

  // Déconnecter un socket spécifique
  public disconnectSocket(socketId: string, reason?: string): void {
    const socket = this.io?.sockets.sockets.get(socketId);
    if (socket) {
      socket.disconnect(!!reason);
      logger.info(`Socket ${socketId} déconnecté${reason ? ` (${reason})` : ''}`);
    }
  }
}

export const socketService = SocketService.getInstance();
