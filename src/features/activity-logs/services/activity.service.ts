import { addDoc, getDocs, query, orderBy, limit, doc, getDoc } from 'firebase/firestore';
import { COLLECTIONS } from '@/firebase/collections';
import { ActivityLog, ActivityAction, EntityType } from '../types/activity.types';

export class ActivityLogsService {
  static async logActivity(
    action: ActivityAction,
    entityType: EntityType,
    entityId: string,
    details: string,
    performedBy: string,
    branchId?: string
  ): Promise<void> {
    try {
      // Look up the user's name for easy display
      let performedByName = 'Unknown User';
      try {
        const userDoc = await getDoc(doc(COLLECTIONS.USERS, performedBy));
        if (userDoc.exists()) {
          performedByName = userDoc.data().name || userDoc.data().email || 'Unknown User';
        }
      } catch (e) {
        console.warn('Failed to resolve user name for activity log', e);
      }

      await addDoc(COLLECTIONS.ACTIVITY_LOGS, {
        action,
        entityType,
        entityId,
        details,
        performedBy,
        performedByName,
        branchId: branchId || 'UNKNOWN',
        createdAt: Date.now(),
      });
    } catch (error) {
      console.error('Failed to write activity log', error);
      // We don't want activity logging to fail the main transaction, so we just catch and log
    }
  }

  static async getRecentLogs(maxCount: number = 100): Promise<ActivityLog[]> {
    const q = query(
      COLLECTIONS.ACTIVITY_LOGS,
      orderBy('createdAt', 'desc'),
      limit(maxCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
  }
}
