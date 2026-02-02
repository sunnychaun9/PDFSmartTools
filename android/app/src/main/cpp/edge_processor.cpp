#include <jni.h>
#include <string>
#include <vector>
#include <android/log.h>
#include <opencv2/opencv.hpp>

#define LOG_TAG "EdgeProcessor"
#define ALOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define ALOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

using namespace cv;
using namespace std;

extern "C" JNIEXPORT jfloatArray JNICALL
Java_com_pdfsmarttools_scan_EdgeProcessor_detectDocumentContour(JNIEnv* env, jclass /*cls*/, jstring imagePathJ) {
    const char* imagePath = env->GetStringUTFChars(imagePathJ, 0);
    Mat img = imread(imagePath);
    env->ReleaseStringUTFChars(imagePathJ, imagePath);

    if (img.empty()) {
        ALOGE("Failed to load image for contour detection: %s", imagePath);
        return nullptr;
    }

    Mat gray, blurred, edged;
    cvtColor(img, gray, COLOR_BGR2GRAY);
    GaussianBlur(gray, blurred, Size(5,5), 0);
    Canny(blurred, edged, 75, 200);

    vector<vector<Point>> contours;
    findContours(edged, contours, RETR_LIST, CHAIN_APPROX_SIMPLE);

    double maxArea = 0;
    vector<Point> best;

    for (size_t i = 0; i < contours.size(); ++i) {
        double area = contourArea(contours[i]);
        if (area < 1000) continue;
        vector<Point> approx;
        approxPolyDP(contours[i], approx, 0.02 * arcLength(contours[i], true), true);
        if (approx.size() == 4 && fabs(contourArea(approx)) > maxArea) {
            best = approx;
            maxArea = fabs(contourArea(approx));
        }
    }

    if (best.size() != 4) {
        // No quad found
        return nullptr;
    }

    // Order points: top-left, top-right, bottom-right, bottom-left
    // Simple ordering by sum and difference
    sort(best.begin(), best.end(), [](const Point& a, const Point& b){ return a.y < b.y; });
    // After sorting by y, first two are top, last two bottom
    Point tl = best[0].x < best[1].x ? best[0] : best[1];
    Point tr = best[0].x < best[1].x ? best[1] : best[0];
    Point bl = best[2].x < best[3].x ? best[2] : best[3];
    Point br = best[2].x < best[3].x ? best[3] : best[2];

    jfloat coords[8];
    coords[0] = (jfloat)tl.x; coords[1] = (jfloat)tl.y;
    coords[2] = (jfloat)tr.x; coords[3] = (jfloat)tr.y;
    coords[4] = (jfloat)br.x; coords[5] = (jfloat)br.y;
    coords[6] = (jfloat)bl.x; coords[7] = (jfloat)bl.y;

    jfloatArray out = env->NewFloatArray(8);
    env->SetFloatArrayRegion(out, 0, 8, coords);
    return out;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_pdfsmarttools_scan_EdgeProcessor_enhanceAndWarp(JNIEnv* env, jclass /*cls*/, jstring inputPathJ, jstring outputPathJ, jfloatArray polygon) {
    const char* inputPath = env->GetStringUTFChars(inputPathJ, 0);
    const char* outputPath = env->GetStringUTFChars(outputPathJ, 0);

    Mat img = imread(inputPath);
    if (img.empty()) {
        ALOGE("Failed to load image for warp: %s", inputPath);
        env->ReleaseStringUTFChars(inputPathJ, inputPath);
        env->ReleaseStringUTFChars(outputPathJ, outputPath);
        return JNI_FALSE;
    }

    jsize len = env->GetArrayLength(polygon);
    if (len < 8) {
        ALOGE("Polygon length invalid: %d", len);
        env->ReleaseStringUTFChars(inputPathJ, inputPath);
        env->ReleaseStringUTFChars(outputPathJ, outputPath);
        return JNI_FALSE;
    }

    jfloat pts[8];
    env->GetFloatArrayRegion(polygon, 0, 8, pts);

    Point2f src[4];
    for (int i=0;i<4;i++) { src[i] = Point2f(pts[i*2], pts[i*2+1]); }

    // Determine width and height of result by distances
    double widthA = hypot(src[2].x - src[3].x, src[2].y - src[3].y);
    double widthB = hypot(src[1].x - src[0].x, src[1].y - src[0].y);
    double maxWidth = max(widthA, widthB);

    double heightA = hypot(src[1].x - src[2].x, src[1].y - src[2].y);
    double heightB = hypot(src[0].x - src[3].x, src[0].y - src[3].y);
    double maxHeight = max(heightA, heightB);

    Point2f dst[4];
    dst[0] = Point2f(0,0);
    dst[1] = Point2f((float)maxWidth - 1, 0);
    dst[2] = Point2f((float)maxWidth - 1, (float)maxHeight - 1);
    dst[3] = Point2f(0, (float)maxHeight - 1);

    Mat M = getPerspectiveTransform(src, dst);
    Mat warped;
    warpPerspective(img, warped, M, Size((int)maxWidth, (int)maxHeight));

    // Convert to grayscale and apply adaptive threshold if requested - basic auto-enhance
    Mat enhanced;
    cvtColor(warped, enhanced, COLOR_BGR2GRAY);
    adaptiveThreshold(enhanced, enhanced, 255, ADAPTIVE_THRESH_GAUSSIAN_C, THRESH_BINARY, 15, 10);

    // Save result as JPEG to outputPath
    vector<int> params = {IMWRITE_JPEG_QUALITY, 95};
    bool ok = imwrite(outputPath, enhanced, params);

    env->ReleaseStringUTFChars(inputPathJ, inputPath);
    env->ReleaseStringUTFChars(outputPathJ, outputPath);
    return ok ? JNI_TRUE : JNI_FALSE;
}
