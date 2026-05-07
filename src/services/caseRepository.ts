import { collection, query, onSnapshot, doc, updateDoc, addDoc, deleteDoc, orderBy, where, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Case } from '../types';

export class CaseRepository {
  private static collection = collection(db, 'cases');

  static subscribeToCases(callback: (cases: Case[]) => void) {
    const q = query(this.collection, orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'cases');
    });
  }

  static async create(data: Partial<Case>) {
    try {
      const docRef = await addDoc(this.collection, {
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        followUps: []
      });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'cases');
    }
  }

  static async update(id: string, data: Partial<Case>) {
    try {
      await updateDoc(doc(db, 'cases', id), {
        ...data,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `cases/${id}`);
    }
  }

  static async delete(id: string) {
    try {
      await deleteDoc(doc(db, 'cases', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `cases/${id}`);
    }
  }
}
