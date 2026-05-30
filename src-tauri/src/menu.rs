use crate::types::*;
use tauri::menu::{
    AboutMetadata, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
    WINDOW_SUBMENU_ID,
};
use tauri::Emitter;

#[cfg(desktop)]
pub(crate) fn build_app_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> tauri::Result<Menu<R>> {
    build_app_menu_with_state(app, None)
}

#[cfg(desktop)]
pub(crate) fn build_app_menu_with_state<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    state: Option<&AppMenuState>,
) -> tauri::Result<Menu<R>> {
    let menu = Menu::default(app)?;
    let has_active_tab = state.map(|state| state.has_active_tab).unwrap_or(false);
    let active_dirty = state.map(|state| state.active_dirty).unwrap_or(false);
    let preview_visible = state.map(|state| state.preview_visible).unwrap_or(true);
    let wrap_lines = state.map(|state| state.wrap_lines).unwrap_or(true);
    let show_invisibles = state.map(|state| state.show_invisibles).unwrap_or(false);
    let theme_preference = state
        .map(|state| state.theme_preference.as_str())
        .unwrap_or("system");
    let menu_is_japanese = state
        .map(|state| state.menu_language.as_str() == "ja")
        .unwrap_or(false);
    let label = |english: &'static str, japanese: &'static str| {
        if menu_is_japanese {
            japanese
        } else {
            english
        }
    };
    let file_menu = Submenu::with_items(
        app,
        label("File", "ファイル"),
        true,
        &[
            &MenuItem::with_id(
                app,
                MENU_NEW_FILE,
                label("New File", "新規ファイル"),
                true,
                Some("CmdOrCtrl+N"),
            )?,
            &MenuItem::with_id(
                app,
                MENU_OPEN_FILE,
                label("Open...", "開く..."),
                true,
                Some("CmdOrCtrl+O"),
            )?,
            &MenuItem::with_id(
                app,
                MENU_OPEN_FOLDER,
                label("Open Folder...", "フォルダを開く..."),
                true,
                Some("CmdOrCtrl+Shift+O"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &recent_submenu(
                app,
                label("Recent Files", "最近使ったファイル"),
                label("No Recent Items", "最近使った項目はありません"),
                MENU_RECENT_FILE_PREFIX,
                state
                    .map(|state| state.recent_files.as_slice())
                    .unwrap_or(&[]),
            )?,
            &recent_submenu(
                app,
                label("Recent Folders", "最近使ったフォルダ"),
                label("No Recent Items", "最近使った項目はありません"),
                MENU_RECENT_FOLDER_PREFIX,
                state
                    .map(|state| state.recent_folders.as_slice())
                    .unwrap_or(&[]),
            )?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            #[cfg(not(target_os = "macos"))]
            &MenuItem::with_id(
                app,
                MENU_PREFERENCES,
                label("Preferences...", "設定..."),
                true,
                Some("CmdOrCtrl+,"),
            )?,
            #[cfg(not(target_os = "macos"))]
            &MenuItem::with_id(
                app,
                MENU_AGENT_WORKBENCH,
                label("Agent Workbench...", "エージェントワークベンチ..."),
                true,
                None::<&str>,
            )?,
            #[cfg(not(target_os = "macos"))]
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MENU_SAVE,
                label("Save", "保存"),
                active_dirty,
                Some("CmdOrCtrl+S"),
            )?,
            &MenuItem::with_id(
                app,
                MENU_SAVE_AS,
                label("Save As...", "別名で保存..."),
                has_active_tab,
                Some("CmdOrCtrl+Shift+S"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                MENU_CLOSE_WINDOW,
                label("Close Window", "ウィンドウを閉じる"),
                true,
                Some("CmdOrCtrl+Shift+W"),
            )?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        label("View", "表示"),
        true,
        &[
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_PREVIEW,
                label("Preview", "プレビュー"),
                true,
                preview_visible,
                Some("CmdOrCtrl+Option+P"),
            )?,
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_WRAP,
                label("Wrap Lines", "行を折り返す"),
                true,
                wrap_lines,
                Some("CmdOrCtrl+Option+W"),
            )?,
            &CheckMenuItem::with_id(
                app,
                MENU_TOGGLE_INVISIBLES,
                label("Show Invisibles", "不可視文字を表示"),
                true,
                show_invisibles,
                Some("CmdOrCtrl+Option+I"),
            )?,
            &PredefinedMenuItem::separator(app)?,
            &Submenu::with_items(
                app,
                label("Theme", "テーマ"),
                true,
                &[
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_SYSTEM,
                        label("System", "システム"),
                        true,
                        theme_preference == "system",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_LIGHT,
                        label("Light", "ライト"),
                        true,
                        theme_preference == "light",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_DARK,
                        label("Dark", "ダーク"),
                        true,
                        theme_preference == "dark",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_SAKURA,
                        "Sakura",
                        true,
                        theme_preference == "sakura",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_YAKOU,
                        label("Yakou", "夜光"),
                        true,
                        theme_preference == "yakou",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_SHOKOU,
                        label("Shokou", "曙光"),
                        true,
                        theme_preference == "shokou",
                        None::<&str>,
                    )?,
                    &CheckMenuItem::with_id(
                        app,
                        MENU_THEME_KOUYOU,
                        label("Kouyou", "紅葉"),
                        true,
                        theme_preference == "kouyou",
                        None::<&str>,
                    )?,
                ],
            )?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(
                app,
                Some(label("Enter Full Screen", "フルスクリーンにする")),
            )?,
        ],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        label("Edit", "編集"),
        true,
        &[
            &PredefinedMenuItem::undo(app, Some(label("Undo", "取り消す")))?,
            &PredefinedMenuItem::redo(app, Some(label("Redo", "やり直す")))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some(label("Cut", "カット")))?,
            &PredefinedMenuItem::copy(app, Some(label("Copy", "コピー")))?,
            &PredefinedMenuItem::paste(app, Some(label("Paste", "ペースト")))?,
            &PredefinedMenuItem::select_all(app, Some(label("Select All", "すべて選択")))?,
        ],
    )?;
    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        label("Window", "ウィンドウ"),
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some(label("Minimize", "しまう")))?,
            &PredefinedMenuItem::maximize(app, Some(label("Zoom", "拡大/縮小")))?,
            #[cfg(target_os = "macos")]
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(
                app,
                Some(label("Close Window", "ウィンドウを閉じる")),
            )?,
        ],
    )?;
    let help_menu =
        Submenu::with_id_and_items(app, HELP_SUBMENU_ID, label("Help", "ヘルプ"), true, &[])?;

    #[cfg(target_os = "macos")]
    {
        let package_info = app.package_info();
        let config = app.config();
        let about_metadata = AboutMetadata {
            name: Some(package_info.name.clone()),
            version: Some(package_info.version.to_string()),
            copyright: config.bundle.copyright.clone(),
            authors: config
                .bundle
                .publisher
                .clone()
                .map(|publisher| vec![publisher]),
            ..Default::default()
        };
        let app_menu = Submenu::with_items(
            app,
            package_info.name.clone(),
            true,
            &[
                &PredefinedMenuItem::about(
                    app,
                    Some(label("About hazakura-note", "hazakura-note について")),
                    Some(about_metadata),
                )?,
                &PredefinedMenuItem::separator(app)?,
                &MenuItem::with_id(
                    app,
                    MENU_PREFERENCES,
                    label("Preferences...", "設定..."),
                    true,
                    Some("CmdOrCtrl+,"),
                )?,
                &MenuItem::with_id(
                    app,
                    MENU_AGENT_WORKBENCH,
                    label("Agent Workbench...", "エージェントワークベンチ..."),
                    true,
                    None::<&str>,
                )?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, Some(label("Services", "サービス")))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(
                    app,
                    Some(label("Hide hazakura-note", "hazakura-note を隠す")),
                )?,
                &PredefinedMenuItem::hide_others(app, Some(label("Hide Others", "ほかを隠す")))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(
                    app,
                    Some(label("Quit hazakura-note", "hazakura-note を終了")),
                )?,
            ],
        )?;

        menu.remove_at(0)?;
        menu.insert(&app_menu, 0)?;
        menu.remove_at(1)?;
        menu.insert(&file_menu, 1)?;
        menu.remove_at(2)?;
        menu.insert(&edit_menu, 2)?;
        menu.remove_at(3)?;
        menu.insert(&view_menu, 3)?;
        menu.remove_at(4)?;
        menu.insert(&window_menu, 4)?;
        menu.remove_at(5)?;
        menu.insert(&help_menu, 5)?;
    }

    #[cfg(not(any(
        target_os = "macos",
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    )))]
    {
        menu.remove_at(0)?;
        menu.insert(&file_menu, 0)?;
        menu.insert(&view_menu, 2)?;
    }

    #[cfg(any(
        target_os = "linux",
        target_os = "dragonfly",
        target_os = "freebsd",
        target_os = "netbsd",
        target_os = "openbsd"
    ))]
    {
        menu.insert(&file_menu, 0)?;
        menu.insert(&view_menu, 2)?;
    }

    Ok(menu)
}

#[cfg(desktop)]
pub(crate) fn recent_submenu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    title: &str,
    empty_label: &str,
    id_prefix: &str,
    items: &[AppMenuRecentItem],
) -> tauri::Result<Submenu<R>> {
    let submenu = Submenu::new(app, title, true)?;

    if items.is_empty() {
        submenu.append(&MenuItem::new(app, empty_label, false, None::<&str>)?)?;
        return Ok(submenu);
    }

    for (index, item) in items.iter().take(8).enumerate() {
        submenu.append(&MenuItem::with_id(
            app,
            format!("{id_prefix}{index}"),
            menu_label(&item.label),
            true,
            None::<&str>,
        )?)?;
    }

    Ok(submenu)
}

#[cfg(desktop)]
pub(crate) fn menu_label(label: &str) -> String {
    let trimmed = label.trim();

    if trimmed.is_empty() {
        return "Untitled".to_string();
    }

    trimmed.replace('&', "&&")
}

#[cfg(desktop)]
pub(crate) fn emit_app_menu_event<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    event: tauri::menu::MenuEvent,
) {
    let action = event.id().as_ref();

    if action.starts_with(MENU_RECENT_FILE_PREFIX)
        || action.starts_with(MENU_RECENT_FOLDER_PREFIX)
        || matches!(
            action,
            MENU_NEW_FILE
                | MENU_OPEN_FILE
                | MENU_OPEN_FOLDER
                | MENU_SAVE
                | MENU_SAVE_AS
                | MENU_CLOSE_WINDOW
                | MENU_TOGGLE_PREVIEW
                | MENU_TOGGLE_WRAP
                | MENU_TOGGLE_INVISIBLES
                | MENU_THEME_SYSTEM
                | MENU_THEME_LIGHT
                | MENU_THEME_DARK
                | MENU_THEME_SAKURA
                | MENU_THEME_YAKOU
                | MENU_THEME_SHOKOU
                | MENU_THEME_KOUYOU
                | MENU_PREFERENCES
                | MENU_AGENT_WORKBENCH
        )
    {
        let _ = app.emit(MENU_ACTION_EVENT, action);
    }
}
