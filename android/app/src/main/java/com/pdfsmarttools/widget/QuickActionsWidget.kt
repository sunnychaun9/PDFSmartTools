package com.pdfsmarttools.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews
import com.pdfsmarttools.R
import com.pdfsmarttools.MainActivity

/**
 * Home screen widget (4x1) with quick-action buttons:
 * Scan, Compress, Merge, More
 *
 * Each button deep-links to the corresponding tool screen.
 */
class QuickActionsWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        private const val ACTION_SCAN = "com.pdfsmarttools.widget.ACTION_SCAN"
        private const val ACTION_COMPRESS = "com.pdfsmarttools.widget.ACTION_COMPRESS"
        private const val ACTION_MERGE = "com.pdfsmarttools.widget.ACTION_MERGE"
        private const val ACTION_MORE = "com.pdfsmarttools.widget.ACTION_MORE"

        private fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_quick_actions)

            // Set up click intents for each button
            views.setOnClickPendingIntent(
                R.id.widget_btn_scan,
                createDeepLinkIntent(context, ACTION_SCAN, "pdfsmarttools://open/scan")
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_compress,
                createDeepLinkIntent(context, ACTION_COMPRESS, "pdfsmarttools://open/compress")
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_merge,
                createDeepLinkIntent(context, ACTION_MERGE, "pdfsmarttools://open/merge")
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_more,
                createDeepLinkIntent(context, ACTION_MORE, "pdfsmarttools://open")
            )

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun createDeepLinkIntent(
            context: Context,
            action: String,
            deepLink: String
        ): PendingIntent {
            val intent = Intent(context, MainActivity::class.java).apply {
                this.action = Intent.ACTION_VIEW
                data = Uri.parse(deepLink)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            return PendingIntent.getActivity(
                context,
                action.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }
}
