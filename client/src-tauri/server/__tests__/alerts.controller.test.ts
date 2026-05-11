console.log('<<<<< FICHIER DE TEST ALERTS.CONTROLLER.TEST.TS CHARGÉ >>>>>');

import { Request, Response, NextFunction } from 'express';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createAlert, getReceivedAlerts, getSentAlerts, markAsRead, markAllAsRead } from '../controllers/alerts.controller';

// Fonctions Jest pour mocker les méthodes Prisma (modèles au pluriel)
const mockAlertsCreate = jest.fn();
const mockAlertsFindMany = jest.fn();
const mockNotificationsCreate = jest.fn();
const mockNotificationsFindMany = jest.fn();
const mockNotificationsFindFirst = jest.fn();
const mockNotificationsUpdate = jest.fn();
const mockNotificationsUpdateMany = jest.fn();
const mockUsersFindMany = jest.fn();

// Mock PrismaClient de '@prisma/client' (modèles au pluriel: alerts, notifications, users)
jest.mock('@prisma/client', () => ({
  __esModule: true,
  PrismaClient: jest.fn().mockImplementation(() => ({
    alerts: {
      create: mockAlertsCreate,
      findMany: mockAlertsFindMany,
    },
    notifications: {
      create: mockNotificationsCreate,
      findMany: mockNotificationsFindMany,
      findFirst: mockNotificationsFindFirst,
      update: mockNotificationsUpdate,
      updateMany: mockNotificationsUpdateMany,
    },
    users: {
      findMany: mockUsersFindMany,
    },
  })),
}));

// Mock Express req, res, next
const mockRequest = (bodyParams = {}, queryParams = {}, params = {}, user: any = null) => {
    const req = {} as Request;
    req.body = bodyParams;
    req.query = queryParams;
    req.params = params;
    req.user = user;
    return req;
};

const mockResponse = () => {
    const res = {} as Response;
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

const mockNext = jest.fn() as NextFunction;

describe('Alerts Controller', () => {
    beforeEach(() => {
        // Réinitialiser les mocks avant chaque test
        jest.clearAllMocks(); // Cela effacera toutes les instances jest.fn() définies ci-dessus
    });

    describe('createAlert', () => {
        it('devrait créer une alerte et des notifications pour les utilisateurs concernés', async () => {
            const mockUser = { id: 1, role: 'agent', region: 'Nord' };
            const req = mockRequest(
                { 
                    title: 'Test Alerte', 
                    message: 'Ceci est un test', 
                    nature: 'braconnage', 
                    location: JSON.stringify({ lat: 10, lng: 20 }),
                    region: 'Nord',
                    zone: 'ZoneA'
                },
                {},
                {},
                mockUser
            );
            const res = mockResponse();

            const mockCreatedAlert = {
                id: 101,
                title: 'Test Alerte',
                message: 'Ceci est un test',
                nature: 'braconnage',
                location: JSON.stringify({ lat: 10, lng: 20 }),
                region: 'Nord',
                zone: 'ZoneA',
                senderId: mockUser.id,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const mockRelevantUsers = [
                { id: 2, role: 'admin', region: 'Nord' },
                { id: 3, role: 'agent', region: 'Nord' },
            ];

            // Utiliser les fonctions mockées directement
            mockAlertsCreate.mockResolvedValue(mockCreatedAlert);
            mockUsersFindMany.mockResolvedValue(mockRelevantUsers);
            mockNotificationsCreate.mockResolvedValue({ id: 999 });

            await createAlert(req, res, mockNext);

            expect(mockAlertsCreate).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({
                    // title peut être repris tel quel ou fallback
                    message: 'Ceci est un test',
                    nature: 'braconnage',
                    region: 'Nord',
                    zone: 'ZoneA',
                    sender_id: mockUser.id,
                }),
            }));

            expect(mockUsersFindMany).toHaveBeenCalledTimes(1);

            // On s'assure que create a bien été appelé au moins une fois pour créer des notifications
            expect(mockNotificationsCreate).toHaveBeenCalled();

            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                message: 'Alerte créée avec succès',
                alert: mockCreatedAlert,
            }));
            expect(mockNext).not.toHaveBeenCalled();
        });

        it('devrait retourner une erreur 400 si message ou nature sont manquants', async () => {
            const mockUser = { id: 1, role: 'agent', region: 'Nord' };
            const req = mockRequest(
                { 
                    // message manquant (title est optionnel côté contrôleur)
                    // nature manquante
                },
                {},
                {},
                mockUser
            );
            const res = mockResponse();

            await createAlert(req, res, mockNext);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalled();
            expect(mockAlertsCreate).not.toHaveBeenCalled(); // Vérifier cette fonction mockée
            expect(mockNext).not.toHaveBeenCalled();
        });

        // Ajouter d'autres tests pour createAlert : 
        // - utilisateur non authentifié
        // - rôle non autorisé à créer (ex: 'user')
        // - erreur Prisma lors de la création
    });

    // TODO: Ajouter des describe blocks pour getReceivedAlerts, getSentAlerts, markAsRead, markAllAsRead

});
