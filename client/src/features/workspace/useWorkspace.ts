import { useCallback, useEffect, useReducer, useRef } from "react";

import { createApiClient, type ApiClient } from "../../lib/apiClient";
import { initialWorkspaceState, workspaceReducer } from "./reducer";
import {
  selectCanCompile,
  selectCurrentDraft,
  selectIsCurrentDraftDirty,
  selectSelectedResume,
} from "./selectors";

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isAbort(controller: AbortController, error: unknown) {
  return (
    controller.signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

function resumeForPath(
  project: NonNullable<typeof initialWorkspaceState.project>,
  path: string,
) {
  return project.resumes
    .filter(
      (resume) =>
        path === resume.entryPath || path.startsWith(`${resume.dir}/`),
    )
    .sort((left, right) => right.dir.length - left.dir.length)[0];
}

function defaultPath(
  project: NonNullable<typeof initialWorkspaceState.project>,
  resumeId: string,
) {
  const resume = project.resumes.find((candidate) => candidate.id === resumeId);
  if (resume === undefined) return null;
  return (
    project.texFiles.find((file) => file.path === resume.entryPath)?.path ??
    project.texFiles.find((file) => file.path.startsWith(`${resume.dir}/`))
      ?.path ??
    resume.entryPath
  );
}

export function useWorkspace(options: { api?: ApiClient } = {}) {
  const apiRef = useRef<ApiClient>(options.api ?? createApiClient());
  const [state, reactDispatch] = useReducer(
    workspaceReducer,
    initialWorkspaceState,
  );
  const stateRef = useRef(state);
  const projectIdRef = useRef(0);
  const fileIdRef = useRef(0);
  const compileIdRef = useRef(0);
  const synctexIdRef = useRef(0);
  const saveIdRef = useRef(0);
  const saveOperationRef = useRef<{
    controller: AbortController;
    path: string;
    requestId: number;
  } | null>(null);
  const selectionIdRef = useRef(0);
  const lastReadyFileRef = useRef<string | null>(null);
  const controllers = useRef({
    project: null as AbortController | null,
    file: null as AbortController | null,
    save: null as AbortController | null,
    compile: null as AbortController | null,
    synctex: null as AbortController | null,
  });
  const dispatch = useCallback(
    (action: Parameters<typeof workspaceReducer>[1]) => {
      stateRef.current = workspaceReducer(stateRef.current, action);
      reactDispatch(action);
    },
    [],
  );

  const loadFile = useCallback(
    async (path: string, targetLine: number | null = null) => {
      controllers.current.file?.abort();
      const controller = new AbortController();
      controllers.current.file = controller;
      const requestId = fileIdRef.current + 1;
      fileIdRef.current = requestId;
      dispatch({ type: "fileRequested", requestId, path });
      try {
        const file = await apiRef.current.getFile(path, controller.signal);
        if (controller.signal.aborted || requestId !== fileIdRef.current)
          return;
        lastReadyFileRef.current = file.path || path;
        dispatch({
          type: "fileLoaded",
          requestId,
          path: file.path || path,
          content: file.content,
          targetLine,
          ...(targetLine === null
            ? {}
            : { targetLineRequestId: synctexIdRef.current }),
        });
      } catch (error) {
        if (isAbort(controller, error) || requestId !== fileIdRef.current)
          return;
        dispatch({
          type: "fileFailed",
          requestId,
          error: message(error, "Unable to load TeX file"),
        });
      }
    },
    [dispatch],
  );

  const loadProject = useCallback(async () => {
    controllers.current.project?.abort();
    const controller = new AbortController();
    controllers.current.project = controller;
    const requestId = projectIdRef.current + 1;
    projectIdRef.current = requestId;
    dispatch({ type: "projectLoading", requestId });
    try {
      const project = await apiRef.current.getProject(controller.signal);
      if (controller.signal.aborted || requestId !== projectIdRef.current)
        return;
      dispatch({ type: "projectLoaded", requestId, project });
      const firstResume = project.resumes[0];
      const path =
        firstResume === undefined ? null : defaultPath(project, firstResume.id);
      if (path !== null) void loadFile(path);
    } catch (error) {
      if (isAbort(controller, error) || requestId !== projectIdRef.current)
        return;
      dispatch({
        type: "projectFailed",
        requestId,
        error: message(error, "Unable to load project"),
      });
    }
  }, [dispatch, loadFile]);

  const selectResume = useCallback(
    async (id: string) => {
      const project = stateRef.current.project;
      if (
        project === null ||
        !project.resumes.some((resume) => resume.id === id)
      )
        return;
      controllers.current.compile?.abort();
      controllers.current.synctex?.abort();
      compileIdRef.current += 1;
      synctexIdRef.current += 1;
      selectionIdRef.current += 1;
      dispatch({
        type: "resumeSelected",
        resumeId: id,
        compileRequestId: compileIdRef.current,
        synctexRequestId: synctexIdRef.current,
      });
      const path = defaultPath(project, id);
      if (path !== null) await loadFile(path);
    },
    [dispatch, loadFile],
  );

  const selectFile = useCallback(
    async (path: string) => {
      const project = stateRef.current.project;
      const owner = project === null ? undefined : resumeForPath(project, path);
      const previousCompileRequestId = stateRef.current.compileRequestId;
      controllers.current.compile?.abort();
      controllers.current.synctex?.abort();
      compileIdRef.current += 1;
      synctexIdRef.current += 1;
      selectionIdRef.current += 1;
      dispatch({
        type: "compileCancelled",
        requestId: previousCompileRequestId,
      });
      if (
        owner !== undefined &&
        owner.id !== stateRef.current.selectedResumeId
      ) {
        dispatch({
          type: "resumeSelected",
          resumeId: owner.id,
          compileRequestId: compileIdRef.current,
          synctexRequestId: synctexIdRef.current,
        });
      }
      await loadFile(path);
    },
    [dispatch, loadFile],
  );

  const editCurrentFile = useCallback(
    (content: string) => {
      dispatch({ type: "editCurrentFile", content });
    },
    [dispatch],
  );

  const saveCurrentFile = useCallback(async (): Promise<boolean> => {
    const draft = selectCurrentDraft(stateRef.current);
    if (draft === undefined || draft.content === draft.savedContent)
      return true;
    const previousSave = saveOperationRef.current;
    previousSave?.controller.abort();
    if (previousSave !== null) {
      dispatch({
        type: "saveCancelled",
        path: previousSave.path,
        requestId: previousSave.requestId,
      });
    }
    const controller = new AbortController();
    controllers.current.save = controller;
    const requestId = saveIdRef.current + 1;
    saveIdRef.current = requestId;
    const content = draft.content;
    saveOperationRef.current = { controller, path: draft.path, requestId };
    dispatch({ type: "saveStarted", path: draft.path, requestId });
    try {
      await apiRef.current.saveFile(
        { path: draft.path, content },
        controller.signal,
      );
      if (controller.signal.aborted || requestId !== saveIdRef.current) {
        dispatch({ type: "saveCancelled", path: draft.path, requestId });
        return false;
      }
      dispatch({ type: "saveSucceeded", path: draft.path, requestId, content });
      if (saveOperationRef.current?.requestId === requestId) {
        saveOperationRef.current = null;
      }
      return true;
    } catch (error) {
      if (isAbort(controller, error) || requestId !== saveIdRef.current) {
        dispatch({ type: "saveCancelled", path: draft.path, requestId });
        return false;
      }
      dispatch({
        type: "saveFailed",
        path: draft.path,
        requestId,
        error: message(error, "Unable to save TeX file"),
      });
      if (saveOperationRef.current?.requestId === requestId) {
        saveOperationRef.current = null;
      }
      return false;
    }
  }, [dispatch]);

  const compileSelectedResume = useCallback(async () => {
    const beforeSave = stateRef.current;
    const resume = selectSelectedResume(beforeSave);
    const selectionId = selectionIdRef.current;
    if (resume === null || !selectCanCompile(beforeSave)) return;
    if (selectIsCurrentDraftDirty(beforeSave) && !(await saveCurrentFile()))
      return;
    if (selectionId !== selectionIdRef.current) return;
    controllers.current.compile?.abort();
    const controller = new AbortController();
    controllers.current.compile = controller;
    const requestId = compileIdRef.current + 1;
    compileIdRef.current = requestId;
    dispatch({ type: "compileStarted", requestId });
    try {
      const result = await apiRef.current.compile(
        { resumeId: resume.id },
        controller.signal,
      );
      if (
        controller.signal.aborted ||
        requestId !== compileIdRef.current ||
        selectionId !== selectionIdRef.current
      )
        return;
      dispatch({ type: "compileSucceeded", requestId, result });
    } catch (error) {
      if (
        isAbort(controller, error) ||
        requestId !== compileIdRef.current ||
        selectionId !== selectionIdRef.current
      )
        return;
      dispatch({
        type: "compileFailed",
        requestId,
        error: message(error, "Compile request failed"),
      });
    }
  }, [dispatch, saveCurrentFile]);

  const lookupSource = useCallback(
    async (page: number, x: number, y: number) => {
      const current = stateRef.current;
      const stableResume =
        current.fileState === "loading" &&
        lastReadyFileRef.current !== null &&
        current.project !== null
          ? resumeForPath(current.project, lastReadyFileRef.current)
          : undefined;
      const resume = stableResume ?? selectSelectedResume(current);
      if (resume === null) {
        dispatch({
          type: "synctexFailed",
          requestId: synctexIdRef.current,
          error: "Select a resume before looking up a source line.",
        });
        return;
      }
      if (
        stableResume !== undefined &&
        stableResume.id !== current.selectedResumeId
      ) {
        controllers.current.compile?.abort();
        compileIdRef.current += 1;
        dispatch({
          type: "resumeSelected",
          resumeId: stableResume.id,
          compileRequestId: compileIdRef.current,
          synctexRequestId: synctexIdRef.current,
        });
      }
      controllers.current.synctex?.abort();
      controllers.current.file?.abort();
      const cancelledFileId = fileIdRef.current + 1;
      fileIdRef.current = cancelledFileId;
      dispatch({
        type: "fileCancelled",
        requestId: cancelledFileId - 1,
        path: lastReadyFileRef.current,
      });
      const controller = new AbortController();
      controllers.current.synctex = controller;
      const requestId = synctexIdRef.current + 1;
      synctexIdRef.current = requestId;
      dispatch({ type: "synctexStarted", requestId });
      try {
        const result = await apiRef.current.lookupSynctex(
          { resumeId: resume.id, page, x, y },
          controller.signal,
        );
        if (controller.signal.aborted || requestId !== synctexIdRef.current)
          return;
        if (!result.found) {
          dispatch({ type: "synctexNotFound", requestId });
          return;
        }
        const project = stateRef.current.project;
        const owner =
          project === null ? undefined : resumeForPath(project, result.file);
        if (
          owner !== undefined &&
          owner.id !== stateRef.current.selectedResumeId
        ) {
          compileIdRef.current += 1;
          controllers.current.compile?.abort();
          dispatch({
            type: "resumeSelected",
            resumeId: owner.id,
            compileRequestId: compileIdRef.current,
            synctexRequestId: requestId,
          });
        }
        await loadFile(result.file, result.line);
        if (controller.signal.aborted || requestId !== synctexIdRef.current)
          return;
        dispatch({
          type: "synctexOpened",
          requestId,
          file: result.file,
          line: result.line,
        });
      } catch (error) {
        if (isAbort(controller, error) || requestId !== synctexIdRef.current)
          return;
        dispatch({
          type: "synctexFailed",
          requestId,
          error: message(error, "SyncTeX lookup failed."),
        });
      }
    },
    [dispatch, loadFile],
  );

  useEffect(() => {
    const activeControllers = controllers.current;
    void loadProject();
    return () => {
      Object.values(activeControllers).forEach((controller) =>
        controller?.abort(),
      );
    };
  }, [loadProject]);

  return {
    state,
    loadProject,
    selectResume,
    selectFile,
    editCurrentFile,
    saveCurrentFile,
    compileSelectedResume,
    lookupSource,
  };
}
